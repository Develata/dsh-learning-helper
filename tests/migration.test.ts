import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { openAuthoring, authoringDrafts } from './authoring-helpers.js';
import { migrateV1 } from '../src/workspace/migration.js';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import { WorkspaceResolver } from '../src/workspace/context.js';
const digest = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
test('explicit v1 migration preserves full graded state, source text and every citation; legacy bytes untouched', async t => {
  const root = mkdtempSync(join(tmpdir(), 'lh-migration-test-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'old-home'); const workspace = join(root, 'workspace'); const legacyDir = join(home, 'learning-helper');
  mkdirSync(legacyDir, { recursive: true }); mkdirSync(workspace);
  const statePath = join(legacyDir, 'state.db'); const evidencePath = join(legacyDir, 'evidence.db');
  const old = await openAuthoring(statePath, evidencePath); const drafts = await authoringDrafts(old);
  await old.authoring.publishOutline(drafts.outline); await old.authoring.publishInitialPlan(drafts.plan);
  const published = await old.authoring.publishQuiz(drafts.quiz);
  await old.service.submit('authoring', { submissionId: 'migration-attempt', quizId: published.quiz.id,
    answers: published.quiz.items.map((i, n) => ({ itemId: i.id, selectedOption: n < 3 ? 0 : 1 })) });
  const snapshot = old.store.get('authoring'); const hit = old.evidence.search({ courseId: 'authoring', query: '一致连续' }).results[0]!;
  await old.close(); const hashes = [digest(statePath), digest(evidencePath)];
  const result = await migrateV1({ courseId: 'authoring', workspace, dshHome: home, offline: true }); assert.equal(result.deduplicated, false);
  assert.deepEqual([digest(statePath), digest(evidencePath)], hashes);
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: workspace, sessionIds: ['s'] }]));
  try {
    await projects.use('s', new AbortController().signal, p => {
      assert.deepEqual(p.learning.getState(p.projectId).conceptStates, snapshot!.conceptStates);
      assert.equal(p.learning.getState(p.projectId).plan!.version, 2);
      assert.equal(p.learning.getQuizResult(p.projectId, published.quiz.id)!.correctCount, 3);
      assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [hit.chunkId] }).chunks[0]!.canonicalRef, hit.canonicalRef);
      const s = p.assets.listSources(p.projectId)[0]!;
      assert.match(readFileSync(join(workspace, s.canonicalAsset!), 'utf8'), /Heine/);
    });
  } finally { await projects.close(); }
  assert.equal((await migrateV1({ courseId: 'authoring', workspace, dshHome: home, offline: true })).deduplicated, true);
  assert.deepEqual([digest(statePath), digest(evidencePath)], hashes);
});
test('migration refuses populated destination, unknown course and missing offline assertion without changing data', async t => {
  const root = mkdtempSync(join(tmpdir(), 'lh-migration-fail-')); t.after(() => rmSync(root, { recursive: true, force: true }));
  const home = join(root, 'home'); const workspace = join(root, 'workspace'); mkdirSync(join(home, 'learning-helper'), { recursive: true }); mkdirSync(workspace);
  const old = await openAuthoring(join(home, 'learning-helper/state.db'), join(home, 'learning-helper/evidence.db')); await authoringDrafts(old); await old.close();
  const input = { courseId: 'authoring', workspace, dshHome: home, offline: true };
  await assert.rejects(migrateV1({ ...input, offline: false }), { code: 'invalid-input' });
  await assert.rejects(migrateV1({ ...input, courseId: 'missing' }), { code: 'not-found' });
  assert.equal(existsSync(join(workspace, '.learning-helper')), false);
  mkdirSync(join(workspace, 'learning-assets')); writeFileSync(join(workspace, 'learning-assets/keep.md'), 'user-owned');
  await assert.rejects(migrateV1(input), { code: 'conflict' });
  assert.equal(readFileSync(join(workspace, 'learning-assets/keep.md'), 'utf8'), 'user-owned');
});
