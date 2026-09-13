import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { PdfParser, parsedPageSchema } from '../providers/pdf-parser.js';
import type { PageImage, ParsedPage } from '../providers/pdf-parser.js';
import { WorkspaceEvidenceStore, generationChunkId } from '../providers/workspace-evidence.js';
import { WORKSPACE_LIMITS as Q, pdfModeSchema, originalReadSchema } from '../domain/assets.js';
import { filenameSchema, textWindow, EVIDENCE_LIMITS } from '../domain/evidence.js';
import type { Source, SourceChunk } from '../domain/evidence.js';
import type { PdfMode } from '../domain/assets.js';
import { hashText, validate } from './evidence.js';
import { readWorkspaceFile, workspacePath, writeWorkspaceFile } from '../workspace/files.js';
import { LearningError } from '../domain/errors.js';
import { cancelled } from './cancellation.js';

export interface VisionContext { sessionId: string }
export interface VisionCapability { available: boolean; cacheKey: string }
/** Public Harness provider adapter or a deterministic test provider. No durable authority. */
export interface DocumentVisionProvider {
  available(context: VisionContext, signal: AbortSignal): Promise<VisionCapability>;
  understandPages(context: VisionContext, pages: PageImage[], signal: AbortSignal): Promise<unknown>;
}
export const noVision: DocumentVisionProvider = {
  async available() { return { available: false, cacheKey: 'unavailable' }; },
  async understandPages() { throw new LearningError('unavailable', 'Current model/provider does not support PDF vision'); },
};
const importSchema = z.strictObject({ filename: filenameSchema, mode: pdfModeSchema.default('auto') });
const visionPagesSchema = z.array(parsedPageSchema.omit({ reasons: true })).min(1).max(4);

export function pageChunks(source: Source, generation: string, pages: Pick<ParsedPage, 'page' | 'text'>[]): SourceChunk[] {
  const chunks: SourceChunk[] = [];
  const nextBlocks = new Map<number, number>();
  for (const page of pages) {
    let offset = 0; let block = nextBlocks.get(page.page) ?? 0;
    while (offset < page.text.length) {
      const text = textWindow(page.text, offset, EVIDENCE_LIMITS.chunkChars); offset += text.length;
      if (!text.trim()) continue;
      if (chunks.length >= Q.generationChunks) throw new LearningError('limit-exceeded', 'PDF has too many chunks');
      chunks.push({ id: generationChunkId(source.id, generation, chunks.length), sourceId: source.id, courseId: source.courseId,
        ordinal: chunks.length, text, locator: { kind: 'pdf', page: page.page, block: block++ } });
    }
    nextBlocks.set(page.page, block);
  }
  return chunks;
}
/** Immutable archive, then normalized generation; failed enhancements retain existing evidence. */
export class PdfSources {
  private readonly stopping = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private readonly active = new Set<string>();
  constructor(readonly root: string, readonly projectId: string, private readonly store: WorkspaceEvidenceStore,
    private readonly parser = new PdfParser(), private readonly vision: DocumentVisionProvider = noVision) {}
  identify(bytes: Uint8Array): string { return `src_${hashText(`${this.projectId}:${createHash('sha256').update(bytes).digest('hex')}`)}`; }
  import(input: unknown, bytes: Uint8Array, context: VisionContext, signal: AbortSignal) {
    signal.throwIfAborted();
    if (this.stopping.signal.aborted) throw new LearningError('closed', 'PDF pipeline is closing');
    const draft = validate(importSchema, input);
    if (bytes.length > Q.pdfBytes || bytes.length < 8 || !Buffer.from(bytes.subarray(0, 1024)).includes('%PDF-')) throw new LearningError('invalid-input', 'Use a PDF of at most 64 MiB');
    if (this.pending.size >= 2) throw new LearningError('unavailable', 'PDF import capacity reached');
    const contentHash = createHash('sha256').update(bytes).digest('hex'); const now = new Date().toISOString();
    const id = this.identify(bytes);
    if (this.active.has(id)) throw new LearningError('conflict', 'This PDF is already processing');
    const originalAsset = `.learning-helper/archive/${id}/original.pdf`;
    const source: Source = { id, courseId: this.projectId, contentHash, originalAsset, filename: draft.filename, mimeType: 'application/pdf',
      byteSize: bytes.length, status: 'processing', chunkCount: 0, parser: this.parser.id, createdAt: now, updatedAt: now, parseMode: draft.mode };
    const result = this.store.begin(source);
    if (result.deduplicated && (result.source.parser.startsWith('mineru-') || (result.source.parseMode === draft.mode && !result.source.parseWarning))) return Promise.resolve(result);
    this.store.parsingMetadata(id, { parsing: 'processing' });
    this.active.add(id);
    const signal2 = AbortSignal.any([signal, this.stopping.signal, AbortSignal.timeout(600_000)]);
    const operation = this.parse(result.source, bytes, draft.mode, context, signal2);
    this.pending.add(operation);
    const release = () => { this.pending.delete(operation); this.active.delete(id); };
    void operation.then(release, release);
    return operation;
  }
  private async parse(source: Source, bytes: Uint8Array, mode: PdfMode, context: VisionContext, signal: AbortSignal) {
    try {
      const original = source.originalAsset!;
      if (existsSync(workspacePath(this.root, original))) {
        if (createHash('sha256').update(readWorkspaceFile(this.root, original, Q.pdfBytes)).digest('hex') !== source.contentHash) throw new Error('Archived PDF checksum mismatch');
      } else writeWorkspaceFile(this.root, original, bytes);
      const local = await this.parser.parse(bytes, signal); signal.throwIfAborted();
      source = this.store.parsingMetadata(source.id, { pageCount: local.pageCount, originalAsset: original, parseMode: mode, parseWarning: undefined });
      const localId = `gen_${hashText(`${this.parser.id}:local-fast`)}`;
      const localChunks = pageChunks(source, localId, local.pages);
      const pages = mode === 'local-fast' ? [] : local.pages.filter(p => mode === 'high-accuracy' || p.reasons.length > 0);
      // Initial ingestion can expose local evidence while vision runs. A reparse must
      // preserve the previous complete generation until its requested replacement is ready.
      if (localChunks.length && (source.status !== 'ready' || !pages.length))
        source = this.store.activate({ ...source, parser: this.parser.id }, localId, localChunks);
      if (!pages.length && !localChunks.length) throw new LearningError('invalid-input', 'PDF contains no locally extractable text; use vision or MinerU');
      if (pages.length) {
        const capability = await cancelled(this.vision.available(context, signal), signal);
        if (!capability.available) {
          source = this.store.parsingMetadata(source.id, { parseWarning: 'vision-unavailable' });
          if (mode === 'high-accuracy' || !localChunks.length) throw new LearningError('unavailable', 'Current model/provider does not support PDF vision; local evidence, if present, remains available');
        } else {
          if (pages.length > 64) throw new LearningError('limit-exceeded', 'At most 64 visual pages per import; use local-fast or split the PDF');
          const generation = `gen_${hashText(`${this.parser.id}:${mode}:${capability.cacheKey}`)}`;
          this.store.reserveGeneration(source.id, generation);
          const understood = new Map<number, string>();
          for (const page of pages) {
            signal.throwIfAborted();
            const cache = `.learning-helper/generations/${source.id}/${generation}/page-${page.page}.json`;
            let parsed: { page: number; text: string };
            if (existsSync(workspacePath(this.root, cache))) {
              const result = validate(visionPagesSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readWorkspaceFile(this.root, cache, Q.generationBytes))));
              if (result.length !== 1) throw new LearningError('invalid-input', 'Invalid cached vision page');
              parsed = result[0]!;
            }
            else {
              const images = await this.parser.render(bytes, [page.page], signal);
              const callSignal = AbortSignal.any([signal, AbortSignal.timeout(60_000)]);
              const result = validate(visionPagesSchema, await cancelled(this.vision.understandPages(context, images, callSignal), callSignal));
              signal.throwIfAborted();
              if (result.length !== 1 || result[0]!.page !== page.page || !result[0]!.text.trim()) throw new LearningError('invalid-input', 'Vision page identity/content mismatch');
              parsed = result[0]!;
              this.store.writeDerived(source.id, generation, `page-${page.page}.json`, JSON.stringify(result));
            }
            if (parsed.page !== page.page || !parsed.text.trim()) throw new LearningError('invalid-input', 'Vision result has missing text or incorrect page');
            understood.set(page.page, parsed.text);
          }
          const merged = local.pages.map(page => ({ page: page.page, text: understood.get(page.page) ?? page.text }));
          source = this.store.activate({ ...source, parser: `vision-${hashText(capability.cacheKey).slice(0, 16)}`, updatedAt: new Date().toISOString() }, generation, pageChunks(source, generation, merged));
        }
      }
      if (this.store.getSource(source.id).status !== 'ready') throw new LearningError('invalid-input', 'PDF contains no extractable text; select an available visual provider or MinerU');
      this.store.parsingMetadata(source.id, { parsing: 'ready' });
      return { source: this.store.getSource(source.id), deduplicated: false };
    } catch (error) {
      this.store.parsingMetadata(source.id, { parsing: 'failed' });
      const current = this.store.getSource(source.id);
      if (current.status === 'ready') {
        if (!current.parseWarning) this.store.parsingMetadata(source.id, { parseWarning: 'vision-failed' });
      } else this.store.fail(source.id, signal.aborted ? 'cancelled' : 'parse-failed', new Date().toISOString());
      throw error;
    }
  }
  async original(input: unknown, signal: AbortSignal): Promise<{ source: Source; images: PageImage[] }> {
    const draft = validate(originalReadSchema, input); const source = this.store.getSource(draft.sourceId);
    if (source.mimeType !== 'application/pdf' || !source.originalAsset || !source.pageCount || draft.pages.some(p => p > source.pageCount!)) throw new LearningError('invalid-input', 'Select 1–4 existing PDF pages in this Workspace');
    const bytes = readWorkspaceFile(this.root, source.originalAsset, Q.pdfBytes);
    if (createHash('sha256').update(bytes).digest('hex') !== source.contentHash) throw new LearningError('unavailable', 'Archived PDF checksum mismatch');
    return { source, images: await this.parser.render(bytes, draft.pages, signal) };
  }
  async close(): Promise<void> { this.stopping.abort(); await Promise.allSettled([...this.pending]); }
}
