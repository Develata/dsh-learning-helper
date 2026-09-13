import { existsSync } from 'node:fs';
import { z } from 'zod';
import { LearningError } from '../domain/errors.js';
import { WORKSPACE_LIMITS as Q } from '../domain/assets.js';
import { sourceIdSchema } from '../domain/evidence.js';
import { readConfig } from '../workspace/config.js';
import type { MinerUConfig } from '../workspace/config.js';
import { readWorkspaceFile, writeWorkspaceFile, workspacePath } from '../workspace/files.js';
import { hashText, validate } from './evidence.js';
import { pageChunks } from './pdf.js';
import { MinerUAssetizer, UnknownMinerUSubmission, MinerUTaskTerminalError, awaitMinerU } from '../providers/mineru.js';
import type { DocumentAssetizer } from '../providers/mineru.js';
import type { WorkspaceEvidenceStore } from '../providers/workspace-evidence.js';
import { createHash } from 'node:crypto';

const inputSchema = z.strictObject({ sourceId: sourceIdSchema, retryUnknown: z.boolean().default(false) });
const jobSchema = z.strictObject({ sourceId: sourceIdSchema, configKey: z.string().length(64),
  state: z.enum(['submitting', 'submitted', 'ready', 'failed', 'outcome-unknown']),
  taskId: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/).optional(), generationId: z.string().max(80).optional(), updatedAt: z.iso.datetime() });
type Job = z.infer<typeof jobSchema>;
let activeJobs = 0;
/** Host owns continuation; a response disconnect cannot create duplicate remote submissions. */
export class Assetization {
  private readonly running = new Map<string, Promise<void>>();
  private readonly stopping = new AbortController();
  constructor(private readonly root: string, private readonly store: WorkspaceEvidenceStore,
    private readonly factory: (config: MinerUConfig) => DocumentAssetizer = c => new MinerUAssetizer(c, process.env.LEARNING_HELPER_MINERU_TOKEN),
    private readonly pollMs = 2000) {}
  private path(id: string) { return `.learning-helper/generations/${id}/mineru-job.json`; }
  private load(id: string): Job | undefined {
    if (!existsSync(workspacePath(this.root, this.path(id)))) return undefined;
    const job = validate(jobSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readWorkspaceFile(this.root, this.path(id), 16_384))));
    if (job.sourceId !== id) throw new LearningError('unavailable', 'MinerU job ownership mismatch'); return job;
  }
  private save(job: Job): void { writeWorkspaceFile(this.root, this.path(job.sourceId), JSON.stringify({ ...job, updatedAt: new Date().toISOString() })); }
  recover(): void {
    for (const source of this.store.listSources(this.store.projectId)) {
      const job = this.load(source.id);
      if (!job || job.state === 'ready') continue;
      if (job.state === 'submitting') { this.save({ ...job, state: 'outcome-unknown' }); this.store.assetization(source.id, 'outcome-unknown'); }
      else this.store.assetization(source.id, job.state === 'outcome-unknown' ? 'outcome-unknown' : 'failed');
    }
  }
  start(input: unknown, signal: AbortSignal): { accepted: boolean; done: Promise<void> } {
    signal.throwIfAborted(); this.stopping.signal.throwIfAborted();
    const { sourceId, retryUnknown } = validate(inputSchema, input); const source = this.store.getSource(sourceId);
    if (source.mimeType !== 'application/pdf' || !source.originalAsset || !source.pageCount) throw new LearningError('invalid-input', 'MinerU requires an archived, inspected PDF');
    if (source.parsing === 'processing') throw new LearningError('conflict', 'PDF parsing is still active; wait before MinerU conversion');
    const existing = this.running.get(sourceId); if (existing) return { accepted: true, done: existing };
    const config = readConfig(this.root).documentParsing.mineru;
    if (!config.enabled || !config.baseUrl) throw new LearningError('unavailable', 'Configure MinerU before conversion');
    const configKey = hashText(JSON.stringify(config)); const old = this.load(sourceId);
    if (old?.state === 'ready' && old.configKey === configKey && source.assetization === 'ready') return { accepted: false, done: Promise.resolve() };
    if (old && ['submitting', 'outcome-unknown'].includes(old.state) && !retryUnknown) throw new LearningError('conflict', 'Previous MinerU submission outcome unknown; check provider, then explicitly confirm retry');
    if (activeJobs >= 2) throw new LearningError('unavailable', 'Two MinerU conversions are active; retry later');
    const adapter = this.factory(config);
    const job: Job = old?.taskId && old.configKey === configKey && old.state === 'submitted' ? old
      : { sourceId, configKey, state: 'submitting', updatedAt: new Date().toISOString() };
    this.save(job); this.store.assetization(sourceId, 'processing'); activeJobs++;
    const combined = AbortSignal.any([signal, this.stopping.signal, AbortSignal.timeout(config.timeoutSeconds * 1000)]);
    const done = this.run(job, adapter, combined);
    this.running.set(sourceId, done);
    const release = () => { activeJobs--; this.running.delete(sourceId); };
    void done.then(release, release); return { accepted: true, done };
  }
  private async run(job: Job, adapter: DocumentAssetizer, signal: AbortSignal): Promise<void> {
    let submitted = !!job.taskId;
    try {
      await adapter.health(signal);
      const source = this.store.getSource(job.sourceId);
      if (!job.taskId) {
        const bytes = readWorkspaceFile(this.root, source.originalAsset!, Q.pdfBytes);
        if (createHash('sha256').update(bytes).digest('hex') !== source.contentHash) throw new LearningError('unavailable', 'Archived PDF checksum mismatch');
        const task = await adapter.submit(bytes, signal); submitted = true;
        job = { ...job, taskId: task.task_id, state: 'submitted' }; this.save(job);
      }
      await awaitMinerU(adapter, await adapter.status(job.taskId!, signal), signal, this.pollMs);
      const output = await adapter.result(job.taskId!, source.pageCount!, signal); signal.throwIfAborted();
      const generation = `gen_${hashText(`mineru:${job.taskId}`)}`;
      const mediaPrefix = `media/${source.id}/${generation}/`;
      const replaceMedia = (text: string) => text.replace(/images\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))/giu, (_all, name: string) => mediaPrefix + name);
      // Only validated names are used as paths. Original response Markdown is retained as a derived artifact.
      this.store.writeDerived(source.id, generation, 'mineru.md', output.markdown);
      this.store.writeDerived(source.id, generation, 'content.json', JSON.stringify(output.blocks));
      for (const media of output.media) this.store.writeDerived(source.id, generation, media.name, media.bytes, 'media');
      const pages = output.blocks.map(b => ({ page: b.page, text: replaceMedia(b.text) }));
      const chunks = pageChunks(source, generation, pages);
      this.store.activate({ ...source, parser: `mineru-${output.version}`, updatedAt: new Date().toISOString() }, generation, chunks);
      this.save({ ...job, generationId: generation, state: 'ready' }); this.store.assetization(source.id, 'ready');
    } catch (error) {
      const unknown = error instanceof UnknownMinerUSubmission;
      // A known task can be resumed without another POST after timeout/restart.
      this.save({ ...job, state: unknown ? 'outcome-unknown' : submitted && !(error instanceof MinerUTaskTerminalError) ? 'submitted' : 'failed' });
      this.store.assetization(job.sourceId, unknown ? 'outcome-unknown' : 'failed'); throw error;
    }
  }
  async close(): Promise<void> { this.stopping.abort(); await Promise.allSettled([...this.running.values()]); }
}
