import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import { SqliteStorageBackend, Config } from '@deepseek-ai/dsh-storage-sqlite';
import { DatabaseSync, backup } from 'node:sqlite';
import { existsSync, mkdtempSync, renameSync, rmSync, statSync, copyFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { HarnessLearningStore } from '../providers/storage-domain.js';
import { WorkspaceLearningStore } from '../providers/workspace-state.js';
import { SqliteEvidenceStore } from '../providers/evidence-sqlite.js';
import { WorkspaceEvidenceStore } from '../providers/workspace-evidence.js';
import { LearningError } from '../domain/errors.js';
import { idSchema } from '../domain/model.js';
import { sourceChunkSchema } from '../domain/evidence.js';
import { hashText, validate } from '../services/evidence.js';
import { canonicalRoot, workspacePath, workspaceDirectory, writeWorkspaceFile, readWorkspaceFile, syncDirectory } from './files.js';
import { readManifest, manifestSchema } from './context.js';

const inputSchema = z.strictObject({ courseId: idSchema, workspace: z.string().min(1).max(4096), dshHome: z.string().min(1).max(4096), offline: z.literal(true) });
/** Operator-only CLI. Paths are never accepted by learning tools or browser routes. */
export async function migrateV1(input: unknown) {
  const args = validate(inputSchema, input); const root = canonicalRoot(args.workspace); const home = canonicalRoot(args.dshHome);
  const sourcePaths = ['state.db', 'evidence.db'].map(name => workspacePath(home, `learning-helper/${name}`));
  for (const path of sourcePaths) if (!existsSync(path) || statSync(path).size > 512 * 1024 * 1024) throw new LearningError('invalid-input', 'Expected offline v0.1 databases, at most 512 MiB each');
  const watchedPaths = sourcePaths.flatMap(p => [p, p + '-wal', p + '-journal']);
  const stamp = (p: string) => existsSync(p) ? (() => { const s = statSync(p, { bigint: true }); return `${s.ino}:${s.size}:${s.mtimeNs}:${s.ctimeNs}`; })() : null;
  const initialStats = watchedPaths.map(stamp);
  const staging = mkdtempSync(join(root, '.learning-helper-migration-')); let assetsActivated = false; let completed = false;
  const stageName = relative(root, staging); let state: WorkspaceLearningStore | undefined; let target: WorkspaceEvidenceStore | undefined;
  try {
    // Public SQLite backup creates consistent database copies. All Harness reads/recovery occur only on those copies.
    for (const [i, path] of sourcePaths.entries()) {
      const inputCopy = join(staging, `input-${i}.db`); copyFileSync(path, inputCopy);
      for (const suffix of ['-wal', '-journal']) if (existsSync(path + suffix)) {
        workspacePath(home, `learning-helper/${i === 0 ? 'state.db' : 'evidence.db'}${suffix}`);
        if (statSync(path + suffix).size > 512 * 1024 * 1024) throw new LearningError('limit-exceeded', 'Legacy journal exceeds snapshot limit');
        copyFileSync(path + suffix, inputCopy + suffix);
      }
      const db = new DatabaseSync(inputCopy, { readOnly: true, allowExtension: false });
      try {
        const deadline = Date.now() + 30_000;
        await backup(db, join(staging, `legacy-${i}.db`), { progress() { if (Date.now() > deadline) throw new LearningError('unavailable', 'Legacy snapshot timed out'); } });
      } finally { db.close(); }
    }
    const ctx = new Context(); await ctx.plugin(Storage);
    const backend = new SqliteStorageBackend(new Config({ path: join(staging, 'legacy-0.db') }));
    const unregister = ctx.storage.backend.register('sqlite', backend);
    let legacy: HarnessLearningStore | undefined;
    let aggregate;
    try { legacy = await HarnessLearningStore.open(new DomainFacility(ctx, { backend: 'sqlite' })); aggregate = legacy.get(args.courseId); }
    finally { await legacy?.close(); unregister(); await backend.close(); await ctx.fiber.dispose(); }
    if (!aggregate) throw new LearningError('not-found', 'Legacy course not found; legacy data unchanged');
    // This is our v1 Evidence schema, not a private Harness SQL contract.
    const rawEvidence = new DatabaseSync(join(staging, 'legacy-1.db'), { readOnly: true });
    const rawSources = rawEvidence.prepare('SELECT data FROM sources WHERE course_id=? ORDER BY id').all(args.courseId).map(row => JSON.parse(String(row.data))); rawEvidence.close();
    const validatedEvidence = new SqliteEvidenceStore(join(staging, 'legacy-1.db'), { fts: false });
    const sources = validatedEvidence.listSources(args.courseId); validatedEvidence.close();
    const legacyEvidence = new DatabaseSync(join(staging, 'legacy-1.db'), { readOnly: true, allowExtension: false });
    const chunks = new Map<string, z.infer<typeof sourceChunkSchema>[]>();
    try {
      for (const source of sources) {
        if (source.mimeType === 'application/pdf') throw new LearningError('invalid-input', 'v0.1 migration supports original TXT/Markdown sources only');
        chunks.set(source.id, legacyEvidence.prepare('SELECT * FROM chunks WHERE source_id=? AND course_id=? ORDER BY ordinal').all(source.id, args.courseId).map(row => sourceChunkSchema.parse({
          id: row.id, sourceId: row.source_id, courseId: row.course_id, ordinal: row.ordinal, text: row.text, locator: JSON.parse(String(row.locator)),
        })));
      }
    } finally { legacyEvidence.close(); }
    const fingerprint = hashText(JSON.stringify({ aggregate, sources: rawSources, chunks: [...chunks] }));
    const existing = readManifest(root);
    if (existing) {
      if (!existsSync(workspacePath(root, '.learning-helper/migration.json'))) throw new LearningError('conflict', 'Workspace was initialized independently; no migration overwritten');
      const receipt = JSON.parse(readWorkspaceFile(root, '.learning-helper/migration.json', 16_384).toString('utf8')) as { fingerprint?: string };
      if (existing.projectId !== args.courseId || receipt.fingerprint !== fingerprint) throw new LearningError('conflict', 'Workspace already contains different learning data');
      completed = true; return { projectId: existing.projectId, deduplicated: true, sources: sources.length };
    }
    if (existsSync(workspacePath(root, '.learning-helper')) || existsSync(workspacePath(root, 'learning-assets'))) throw new LearningError('conflict', 'Migration requires absent .learning-helper and learning-assets; nothing overwritten');
    workspaceDirectory(staging, '.learning-helper'); workspaceDirectory(staging, 'learning-assets');
    const { id: _id, createdAt: _time, status: _status, ...metadata } = aggregate.course;
    const manifest = validate(manifestSchema, { ...metadata, schemaVersion: 2, projectId: args.courseId });
    writeWorkspaceFile(staging, '.learning-helper/.gitignore', '*\n!.gitignore\n');
    writeWorkspaceFile(staging, '.learning-helper/config.json', '{"schemaVersion":2,"documentParsing":{"pdfMode":"auto","mineru":{"enabled":false}}}\n');
    state = new WorkspaceLearningStore(workspacePath(staging, '.learning-helper/state.db'), args.courseId);
    await state.create(aggregate);
    target = new WorkspaceEvidenceStore(staging, args.courseId, { create: true });
    const refs = new Set<string>();
    for (const source of sources) {
      target.begin({ ...source, status: 'processing', chunkCount: 0, errorCode: undefined });
      if (source.status !== 'ready') { target.fail(source.id, source.errorCode ?? 'interrupted', source.updatedAt); continue; }
      const values = chunks.get(source.id)!; target.activate(source, 'text-v1', values);
      // Bounded reads validate canonical references and preserve all original v1 chunk IDs/locators.
      for (let i = 0; i < values.length; i += 4) for (const read of target.read(args.courseId, values.slice(i, i + 4).map(c => c.id), new AbortController().signal)) refs.add(read.canonicalRef);
    }
    for (const ref of [...aggregate.concepts.flatMap(c => c.sourceRefs), ...aggregate.quizzes.flatMap(q => q.items.flatMap(i => i.sourceRefs))])
      if (!refs.has(ref)) throw new LearningError('invalid-input', 'Legacy learning state has an unresolved evidence reference; no migration activated');
    if (watchedPaths.some((p, i) => stamp(p) !== initialStats[i])) throw new LearningError('conflict', 'Legacy database/WAL changed; stop v0.1 before migration');
    if (JSON.stringify(state.get(args.courseId)) !== JSON.stringify(aggregate)) throw new Error('Migrated learning snapshot mismatch');
    target.close(); target = undefined; await state.close(); state = undefined;
    writeWorkspaceFile(staging, '.learning-helper/migration.json', JSON.stringify({ schemaVersion: 2, projectId: args.courseId, fingerprint,
      textRepresentation: 'Reconstructed normalized text from lossless v0.1 chunks; not claimed to be original uploaded bytes', migratedAt: new Date().toISOString() }));
    writeWorkspaceFile(staging, '.learning-helper/manifest.json', JSON.stringify(manifest, null, 2));
    if (existsSync(workspacePath(root, '.learning-helper')) || existsSync(workspacePath(root, 'learning-assets'))) throw new LearningError('conflict', 'Workspace changed during migration');
    // Manifest directory is the activation marker. If interrupted between renames, retain stage for explicit recovery.
    renameSync(workspacePath(staging, 'learning-assets'), workspacePath(root, 'learning-assets')); assetsActivated = true;
    renameSync(workspacePath(staging, '.learning-helper'), workspacePath(root, '.learning-helper')); syncDirectory(root); completed = true;
    return { projectId: args.courseId, deduplicated: false, sources: sources.length };
  } finally {
    target?.close(); await state?.close();
    if (!assetsActivated || completed) rmSync(workspacePath(root, stageName), { recursive: true, force: true });
  }
}
