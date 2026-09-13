import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EVIDENCE_LIMITS as L, parsedChunkSchema, textImportSchema, searchArgsSchema, readArgsSchema } from '../domain/evidence.js';
import type { Source, SourceChunk, ParsedChunk, EvidenceHit, EvidenceRead, TextImport } from '../domain/evidence.js';
import { LearningError } from '../domain/errors.js';
import type { LearningService } from './learning.js';

export interface DocumentParser {
  readonly id: 'text-v1';
  parse(input: TextImport, signal: AbortSignal): Promise<ParsedChunk[]>;
}
/** Single Host owner; begin and complete are atomic within the Evidence database. */
export interface EvidenceStore {
  begin(source: Source): { source: Source; deduplicated: boolean };
  complete(source: Source, chunks: SourceChunk[]): void;
  fail(sourceId: string, code: NonNullable<Source['errorCode']>, now: string): void;
  listSources(courseId: string): Source[];
  search(courseId: string, query: string, limit: number, signal: AbortSignal): EvidenceHit[];
  read(courseId: string, chunkIds: string[], signal: AbortSignal): EvidenceRead[];
  close(): void;
}
export const hashText = (text: string): string => createHash('sha256').update(text, 'utf8').digest('hex');
export const chunkIdentity = (sourceId: string, ordinal: number): string => `chk_${hashText(`${sourceId}:text-v1:${ordinal}`)}`;
export function validate<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const path = issue?.path.map(String).join('.').slice(0, 200);
    const opaqueIdHint = issue?.code === 'invalid_format' && issue.path.some(p => p === 'evidenceChunkIds' || p === 'chunkIds')
      ? ' Chunk IDs are opaque: copy the complete chunkId returned by evidence retrieval; do not truncate, retype, calculate or generate an ID.' : '';
    throw new LearningError('invalid-input', `${path ? path + ': ' : ''}${issue?.message ?? 'Invalid evidence input'}${opaqueIdHint}`);
  }
  return result.data;
}
export function normalizeText(raw: string): string {
  if (!raw.isWellFormed() || raw.includes('\0')) throw new LearningError('invalid-input', 'Use valid Unicode text without NUL');
  if (Buffer.byteLength(raw, 'utf8') > L.sourceBytes) throw new LearningError('limit-exceeded', 'Source exceeds 512 KiB');
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!text.trim()) throw new LearningError('invalid-input', 'Source is empty');
  return text;
}

/** Course authority is checked without cloning learner history or corpus into each other. */
export class EvidenceService {
  private readonly stopping = new AbortController();
  private readonly pending = new Set<Promise<unknown>>();
  private closed: Promise<void> | undefined;
  constructor(private readonly learning: LearningService, private readonly store: EvidenceStore,
    private readonly parser: DocumentParser, private readonly clock: () => Date = () => new Date()) {}
  private check(courseId: string, signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.stopping.signal.aborted) throw new LearningError('closed', 'Evidence service is closing');
    this.learning.getCourse(courseId);
  }
  listSources(courseId: string, signal = new AbortController().signal): Source[] {
    this.check(courseId, signal); return this.store.listSources(courseId);
  }
  search(input: unknown, signal = new AbortController().signal) {
    const { courseId, query, limit } = validate(searchArgsSchema, input); this.check(courseId, signal);
    return { courseId, query, results: this.store.search(courseId, query, limit, signal) };
  }
  read(input: unknown, signal = new AbortController().signal) {
    const { courseId, chunkIds } = validate(readArgsSchema, input); this.check(courseId, signal);
    return { courseId, chunks: this.store.read(courseId, chunkIds, signal) };
  }
  importText(courseId: string, input: unknown, signal = new AbortController().signal): Promise<{ source: Source; deduplicated: boolean }> {
    this.check(courseId, signal);
    const draft = validate(textImportSchema, input);
    const text = normalizeText(draft.text);
    if (this.pending.size >= L.importConcurrency) throw new LearningError('unavailable', 'Evidence import capacity reached; retry later');
    const contentHash = hashText(text); const now = this.clock().toISOString();
    const candidate: Source = { id: `src_${hashText(`${courseId}:${contentHash}`)}`, courseId,
      filename: draft.filename, mimeType: draft.mimeType, contentHash, parser: this.parser.id,
      byteSize: Buffer.byteLength(text, 'utf8'), chunkCount: 0, status: 'processing', createdAt: now, updatedAt: now };
    const begun = this.store.begin(candidate);
    if (begun.deduplicated) return Promise.resolve(begun);
    // A failed reimport keeps the first metadata/parser, so its citations remain canonical.
    const source = begun.source;
    const operation = this.parseAndCommit(source, text, signal);
    this.pending.add(operation);
    void operation.then(() => this.pending.delete(operation), () => this.pending.delete(operation));
    return operation;
  }
  private async parseAndCommit(source: Source, text: string, caller: AbortSignal) {
    const controller = new AbortController();
    const abort = () => controller.abort(caller.reason ?? this.stopping.signal.reason);
    caller.addEventListener('abort', abort, { once: true }); this.stopping.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Parser timed out', 'TimeoutError')), L.parserMs);
    let rejectAbort: (() => void) | undefined;
    try {
      if (caller.aborted || this.stopping.signal.aborted) abort();
      const signal = controller.signal;
      const cancelled = new Promise<never>((_resolve, reject) => {
        rejectAbort = () => reject(signal.reason);
        signal.addEventListener('abort', rejectAbort, { once: true });
        if (signal.aborted) rejectAbort();
      });
      if (source.mimeType === 'application/pdf') throw new LearningError('invalid-input', 'Use the PDF import pipeline');
      const parsed = await Promise.race([this.parser.parse({ filename: source.filename, mimeType: source.mimeType, text }, signal), cancelled]);
      signal.throwIfAborted();
      const checked = validate(z.array(parsedChunkSchema).min(1).max(L.chunks), parsed);
      if (checked.map(c => c.text).join('') !== text || checked.some((c, i) => c.ordinal !== i || c.locator.kind !== 'text')) {
        throw new LearningError('invalid-input', 'Parser did not preserve normalized source text/order');
      }
      const chunks = checked.map(c => ({ ...c, id: chunkIdentity(source.id, c.ordinal), sourceId: source.id, courseId: source.courseId }));
      const ready: Source = { ...source, status: 'ready', chunkCount: chunks.length, updatedAt: this.clock().toISOString() };
      this.store.complete(ready, chunks);
      return { source: ready, deduplicated: false };
    } catch (error) {
      const code = controller.signal.aborted ? (controller.signal.reason?.name === 'TimeoutError' ? 'timeout' : 'cancelled')
        : error instanceof LearningError && error.code === 'limit-exceeded' ? 'limit-exceeded' : 'parse-failed';
      this.store.fail(source.id, code, this.clock().toISOString());
      if (controller.signal.aborted) throw new LearningError('unavailable', `Source import ${code}; reimport to retry`);
      throw error;
    } finally {
      clearTimeout(timer); caller.removeEventListener('abort', abort); this.stopping.signal.removeEventListener('abort', abort);
      if (rejectAbort) controller.signal.removeEventListener('abort', rejectAbort);
    }
  }
  close(): Promise<void> {
    if (!this.closed) {
      this.stopping.abort(new DOMException('Evidence service closed', 'AbortError'));
      this.closed = Promise.allSettled([...this.pending]).then(() => this.store.close());
    }
    return this.closed;
  }
}
