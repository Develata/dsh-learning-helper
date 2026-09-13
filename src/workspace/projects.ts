import { recoverUploads } from './temporary.js';
import { existsSync } from 'node:fs';
import { LearningError } from '../domain/errors.js';
import { LearningService } from '../services/learning.js';
import { EvidenceService } from '../services/evidence.js';
import { CourseAuthoringService } from '../services/authoring.js';
import { WorkspaceLearningStore } from '../providers/workspace-state.js';
import { WorkspaceEvidenceStore } from '../providers/workspace-evidence.js';
import { PdfSources, noVision } from '../services/pdf.js';
import type { DocumentVisionProvider } from '../services/pdf.js';
import { TextParser } from '../providers/text-parser.js';
import { Assetization } from '../services/assetization.js';
import { cancelled } from '../services/cancellation.js';
import { WorkspaceResolver, readManifest, initializeProject } from './context.js';
import type { WorkspaceContext, ProjectManifest } from './context.js';
import { workspaceDatabasePath } from './files.js';
import type { DocumentAssetizer } from '../providers/mineru.js';
import type { MinerUConfig } from './config.js';

export interface WorkspaceProject extends WorkspaceContext {
  readonly manifest: ProjectManifest;
  readonly learning: LearningService;
  readonly evidence: EvidenceService;
  readonly assets: WorkspaceEvidenceStore;
  readonly pdf: PdfSources;
  readonly assetization: Assetization;
  readonly authoring: CourseAuthoringService;
}
interface Entry { project: WorkspaceProject; active: number; touched: number; close(): Promise<void> }
/** Bounded per-process handle cache, not a global learning registry. Each action resolves membership anew. */
export class WorkspaceProjects {
  private readonly entries = new Map<string, Entry>();
  private readonly operations = new Set<Promise<unknown>>();
  private readonly stopping = new AbortController();
  private closed: Promise<void> | undefined;
  private acquisition: Promise<unknown> = Promise.resolve();
  constructor(readonly resolver: WorkspaceResolver, private readonly vision: DocumentVisionProvider = noVision,
    private readonly assetizer?: (projectId: string, config: MinerUConfig, signal: AbortSignal) => DocumentAssetizer | Promise<DocumentAssetizer>) {}
  async visionAvailable(sessionId: string, signal: AbortSignal): Promise<boolean> {
    this.resolver.resolve(sessionId);
    const bounded = AbortSignal.any([signal, this.stopping.signal, AbortSignal.timeout(5000)]);
    try { return (await cancelled(this.vision.available({ sessionId }, bounded), bounded)).available; }
    catch { return false; }
  }
  status(sessionId: string | undefined) {
    if (this.stopping.signal.aborted) throw new LearningError('closed', 'Learning Helper is closing');
    return { project: readManifest(this.resolver.resolve(sessionId)) };
  }
  async initialize(sessionId: string | undefined, input: unknown) {
    if (this.stopping.signal.aborted) throw new LearningError('closed', 'Learning Helper is closing');
    if (this.operations.size >= 64) throw new LearningError('unavailable', 'Learning request capacity reached');
    const root = this.resolver.resolve(sessionId);
    const operation = this.acquisition.then(() => { this.stopping.signal.throwIfAborted(); return initializeProject(root, input); });
    this.acquisition = operation.then(() => undefined, () => undefined);
    return this.track(operation);
  }
  private track<T>(operation: Promise<T>): Promise<T> {
    this.operations.add(operation);
    void operation.then(() => this.operations.delete(operation), () => this.operations.delete(operation));
    return operation;
  }
  use<T>(sessionId: string | undefined, signal: AbortSignal, action: (project: WorkspaceProject, signal: AbortSignal) => Promise<T> | T): Promise<T> {
    signal.throwIfAborted();
    if (this.stopping.signal.aborted) return Promise.reject(new LearningError('closed', 'Learning Helper is closing'));
    const root = this.resolver.resolve(sessionId);
    const combined = AbortSignal.any([signal, this.stopping.signal]);
    if (this.operations.size >= 64) return Promise.reject(new LearningError('unavailable', 'Learning request capacity reached'));
    const acquired = this.acquisition.then(async () => {
      combined.throwIfAborted();
      let entry = this.entries.get(root);
      if (!entry) {
        if (this.entries.size >= 8) {
          const idle = [...this.entries.values()].filter(e => e.active === 0).sort((a, b) => a.touched - b.touched)[0];
          if (!idle) throw new LearningError('unavailable', 'Too many active learning workspaces; retry later');
          this.entries.delete(idle.project.root);
          // Close first; a concurrently opened root must not compete with unfinished writes.
          await idle.close(); combined.throwIfAborted();
          entry = this.entries.get(root);
        }
        if (!entry) {
          recoverUploads(root);
          const manifest = readManifest(root);
          if (!manifest) throw new LearningError('conflict', 'Enable Learning Helper in this Workspace first');
          const path = workspaceDatabasePath(root, '.learning-helper/state.db');
          if (!existsSync(path)) throw new LearningError('unavailable', 'Workspace state is missing; explicit recovery required');
          const store = new WorkspaceLearningStore(path, manifest.projectId);
          let openedAssets: WorkspaceEvidenceStore | undefined;
          try {
            const learning = new LearningService(store);
            const course = learning.getCourse(manifest.projectId);
            if (course.title !== manifest.title || course.subject !== manifest.subject || course.dailyMinutes !== manifest.dailyMinutes || course.examAt !== manifest.examAt) throw new Error('Workspace manifest metadata differs from learning state');
            const assets = new WorkspaceEvidenceStore(root, manifest.projectId); openedAssets = assets;
            const evidence = new EvidenceService(learning, assets, new TextParser());
            const pdf = new PdfSources(root, manifest.projectId, assets, undefined, this.vision);
            const assetization = new Assetization(root, assets, this.assetizer ? (config, signal) => this.assetizer!(manifest.projectId, config, signal) : undefined); assetization.recover();
            entry = { project: { root, projectId: manifest.projectId, manifest, learning, evidence, assets, pdf, assetization, authoring: new CourseAuthoringService(learning, evidence) },
              active: 0, touched: Date.now(), close: async () => { await Promise.all([pdf.close(), assetization.close()]); await evidence.close(); await store.close(); } };
            this.entries.set(root, entry);
          } catch (error) { openedAssets?.close(); await store.close(); throw error; }
        }
      }
      entry.active++; return entry;
    });
    this.acquisition = acquired.then(() => undefined, () => undefined);
    const operation = acquired.then(async entry => {
      try { combined.throwIfAborted(); return await action(entry.project, combined); }
      finally { entry.active--; entry.touched = Date.now(); }
    });
    return this.track(operation);
  }
  close(): Promise<void> {
    if (!this.closed) {
      this.stopping.abort(new DOMException('Learning Helper closed', 'AbortError'));
      this.closed = Promise.allSettled([...this.operations]).then(async () => {
        await Promise.all([...this.entries.values()].map(e => e.close())); this.entries.clear();
      });
    }
    return this.closed;
  }
}
