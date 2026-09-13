import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, renameSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import { WorkspaceResolver } from '../src/workspace/context.js';
import { WorkspaceEvidenceStore } from '../src/providers/workspace-evidence.js';
import { writeWorkspaceFile } from '../src/workspace/files.js';
import { recoverUploads } from '../src/workspace/temporary.js';
const signal = () => new AbortController().signal;
async function setup(t: test.TestContext) {
  const parent = mkdtempSync(join(tmpdir(), 'lh-v02-recovery-')); const root = join(parent, 'workspace'); mkdirSync(root);
  t.after(() => rmSync(parent, { recursive: true, force: true }));
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['s'] }])); t.after(() => projects.close());
  const input = { title: 'Analysis', subject: 'Math', dailyMinutes: 60 };
  const init = await Promise.all([projects.initialize('s', input), projects.initialize('s', input)]);
  assert.deepEqual(init[0], init[1]); return { projects, root, parent, id: init[0]!.projectId };
}
test('failed generation attempts and derived bytes reserve bounded capacity across restart', async t => {
  const { projects, root, id } = await setup(t); let sourceId = '';
  await projects.use('s', signal(), async p => {
    const { source } = await p.evidence.importText(p.projectId, { filename: 'a.txt', mimeType: 'text/plain', text: 'Evidence of uniform continuity.' }); sourceId = source.id;
    for (let i = 1; i < 10; i++) p.assets.writeDerived(source.id, `attempt-${i}`, 'draft.json', '{}');
    assert.throws(() => p.assets.writeDerived(source.id, 'attempt-10', 'draft.json', '{}'), { code: 'limit-exceeded' });
    assert.throws(() => p.assets.writeDerived(source.id, 'attempt-1', 'draft.json', '{"different":true}'), { code: 'conflict' });
    assert.equal(p.evidence.search({ courseId: p.projectId, query: 'continuity' }).results.length, 1);
  });
  await projects.close(); const store = new WorkspaceEvidenceStore(root, id);
  try { assert.throws(() => store.reserveGeneration(sourceId, 'more'), { code: 'limit-exceeded' }); }
  finally { store.close(); }
});
test('false text line locators are refused on reopen without resetting the database', async t => {
  const { projects, root, id } = await setup(t);
  await projects.use('s', signal(), p => p.evidence.importText(p.projectId, { filename: 'a.md', mimeType: 'text/markdown', text: '# Title\nOriginal evidence\n' }));
  await projects.close(); const path = join(root, '.learning-helper/evidence.db'); const db = new DatabaseSync(path);
  db.exec("UPDATE chunks SET data=json_set(data,'$.locator.startLine',42)"); db.close();
  assert.throws(() => new WorkspaceEvidenceStore(root, id), /locator start/);
  const check = new DatabaseSync(path); assert.equal(check.prepare('SELECT count(*) AS n FROM chunks').get()!.n, 1); check.close();
});
test('moving complete workspace retains evidence identity and canonical citations', async t => {
  const { projects, root, parent, id } = await setup(t); let ref = '';
  await projects.use('s', signal(), async p => { await p.evidence.importText(p.projectId, { filename: 'a.md', mimeType: 'text/markdown', text: '# 一致连续\nUniform continuity.\n' }); ref = p.evidence.search({ courseId: p.projectId, query: 'continuity' }).results[0]!.canonicalRef; });
  await projects.close(); const moved = join(parent, 'moved'); renameSync(root, moved);
  const store = new WorkspaceEvidenceStore(moved, id);
  try { assert.equal(store.search(id, 'continuity', 1, signal())[0]!.canonicalRef, ref); }
  finally { store.close(); }
});
test('recovery removes only incomplete upload files and preserves unknown files and originals', async t => {
  const { projects, root } = await setup(t); await projects.close();
  const tmp = join(root, '.learning-helper/tmp'); mkdirSync(tmp);
  const upload = join(tmp, 'upload-00000000-0000-0000-0000-000000000000.pdf'); const keep = join(tmp, 'notes.pdf');
  writeFileSync(upload, '%PDF incomplete'); writeFileSync(keep, 'owner file');
  assert.equal(recoverUploads(root), 1); assert.equal(existsSync(upload), false); assert.equal(existsSync(keep), true);
  assert.equal(existsSync(join(root, '.learning-helper/state.db')), true); assert.equal(recoverUploads(root), 0);
});

test('an interrupted atomic file publication blocks repeated temporary growth without deleting evidence', async t => {
  const { projects, root } = await setup(t); await projects.close();
  const path = '.learning-helper/config.json';
  const stale = join(root, `${path}.tmp-00000000-0000-0000-0000-000000000000`); writeFileSync(stale, 'partial');
  for (let i = 0; i < 3; i++) assert.throws(() => writeWorkspaceFile(root, path, '{}'), { code: 'unavailable' });
  assert.equal(existsSync(stale), true); assert.equal(existsSync(join(root, '.learning-helper/state.db')), true);
});

test('a missing or zeroed evidence database never silently creates an empty corpus', async t => {
  const { projects, root, id } = await setup(t); await projects.close(); const path = join(root, '.learning-helper/evidence.db');
  unlinkSync(path); assert.throws(() => new WorkspaceEvidenceStore(root, id), /missing/); assert.equal(existsSync(path), false);
  writeFileSync(path, ''); assert.throws(() => new WorkspaceEvidenceStore(root, id), /no schema/);
});
