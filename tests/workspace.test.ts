import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, renameSync, symlinkSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceResolver, initializeProject, readManifest } from '../src/workspace/context.js';
import { workspacePath, readWorkspaceFile, writeWorkspaceFile } from '../src/workspace/files.js';
import { WorkspaceLearningStore } from '../src/providers/workspace-state.js';
import { LearningService } from '../src/services/learning.js';
import { demoCourse, demoSubmission } from '../src/presets/math-analysis/demo.js';

function directory(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'lh-workspace-test-'));
  t.after(() => rmSync(root, { recursive: true, force: true })); return root;
}
const metadata = { title: '数学分析', subject: '分析', dailyMinutes: 60 };

test('workspace initialization, safe retry, A/B identity and state isolation', async t => {
  const parent = directory(t); const a = join(parent, 'a'); const b = join(parent, 'b'); mkdirSync(a); mkdirSync(b);
  const ma = await initializeProject(a, metadata); const mb = await initializeProject(b, metadata);
  assert.notEqual(ma.projectId, mb.projectId);
  assert.deepEqual(await initializeProject(a, metadata), ma);
  await assert.rejects(initializeProject(a, { ...metadata, title: 'other' }), { code: 'conflict' });
  await assert.rejects(initializeProject(b, { ...metadata, workspaceRoot: a }), { code: 'invalid-input' });
  const store = new WorkspaceLearningStore(workspacePath(a, '.learning-helper/state.db'), ma.projectId);
  try {
    const service = new LearningService(store);
    assert.equal(service.getState(ma.projectId).plan, null);
    assert.equal(service.getState(ma.projectId).concepts.length, 0);
    assert.throws(() => service.getState(mb.projectId), { code: 'not-found' });
    await assert.rejects(service.createCourse({ ...metadata, id: mb.projectId }), { code: 'invalid-input' });
  } finally { await store.close(); }
  assert.equal(readFileSync(join(a, '.learning-helper/.gitignore'), 'utf8'), '*\n!.gitignore\n');
});

test('resolver requires official membership; no fallback or ambiguous owner', t => {
  const root = directory(t);
  const membership = [{ path: root, sessionIds: ['session-a'] }];
  const resolver = new WorkspaceResolver(() => membership);
  assert.equal(resolver.resolve('session-a'), root);
  for (const id of [undefined, 'missing', '../../a']) assert.throws(() => resolver.resolve(id), { code: 'unavailable' });
  membership.push({ path: root, sessionIds: ['session-a'] });
  assert.throws(() => resolver.resolve('session-a'), { code: 'unavailable' });
});

test('workspace move retains manifest identity, relative assets and learning database', async t => {
  const parent = directory(t); const a = join(parent, 'a'); const b = join(parent, 'moved'); mkdirSync(a);
  const manifest = await initializeProject(a, metadata);
  writeWorkspaceFile(a, 'learning-assets/lecture.md', '# 一致连续\n');
  renameSync(a, b);
  assert.deepEqual(readManifest(b), manifest);
  assert.equal(readWorkspaceFile(b, 'learning-assets/lecture.md', 100).toString(), '# 一致连续\n');
  const store = new WorkspaceLearningStore(workspacePath(b, '.learning-helper/state.db'), manifest.projectId);
  try { assert.equal(store.get(manifest.projectId)?.course.title, metadata.title); }
  finally { await store.close(); }
});

test('path traversal, absolute paths and symlinked ancestors or targets fail closed', t => {
  const root = directory(t); const outside = directory(t);
  for (const p of ['../x', '/etc/passwd', 'a/../../x', 'a\\b', 'a//b', 'a/./b']) assert.throws(() => workspacePath(root, p), { code: 'invalid-input' });
  symlinkSync(outside, join(root, 'learning-assets'));
  assert.throws(() => writeWorkspaceFile(root, 'learning-assets/escape.txt', 'bad'), { code: 'invalid-input' });
  symlinkSync('/etc/passwd', join(root, 'file'));
  assert.throws(() => readWorkspaceFile(root, 'file', 10000), { code: 'invalid-input' });
});

test('workspace local store retains deterministic grading, retry and restart without corpus', async t => {
  const root = directory(t); const path = join(root, 'state.db');
  const store = new WorkspaceLearningStore(path, 'demo-calculus');
  const service = new LearningService(store);
  await service.create(demoCourse());
  const receipts = await Promise.all(Array.from({ length: 12 }, () => service.submit('demo-calculus', demoSubmission())));
  assert.ok(receipts.every(r => JSON.stringify(r) === JSON.stringify(receipts[0])));
  const state = store.get('demo-calculus')!;
  assert.equal(state.attempts.length, 5);
  assert.equal(state.conceptStates.find(c => c.conceptId === 'uniform-continuity')?.status, 'weak');
  assert.equal(state.plans.at(-1)?.version, 2);
  await assert.rejects(store.update('demo-calculus', s => ({ ...s, course: { ...s.course, id: 'other' } })));
  assert.deepEqual(store.get('demo-calculus'), state);
  await store.close();
  const restarted = new WorkspaceLearningStore(path, 'demo-calculus');
  try { assert.deepEqual(restarted.get('demo-calculus'), state); } finally { await restarted.close(); }
  assert.throws(() => new WorkspaceLearningStore(path, 'other'), /identity mismatch/);
});

test('unknown database versions and unversioned content are never reset', t => {
  const root = directory(t);
  for (const version of [0, 99]) {
    const path = join(root, `${version}.db`); const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE marker(value TEXT); INSERT INTO marker VALUES('preserved'); PRAGMA user_version=${version};`); db.close();
    assert.throws(() => new WorkspaceLearningStore(path, 'project'));
    const check = new DatabaseSync(path); assert.equal(check.prepare('SELECT value FROM marker').get()?.value, 'preserved'); check.close();
  }
});
