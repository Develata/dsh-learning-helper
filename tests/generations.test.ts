import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject, WorkspaceResolver } from '../src/workspace/context.js';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import { WorkspaceEvidenceStore, generationChunkId } from '../src/providers/workspace-evidence.js';
import { hashText } from '../src/services/evidence.js';
import type { Source } from '../src/domain/evidence.js';
import { WORKSPACE_LIMITS } from '../src/domain/assets.js';

const signal = () => new AbortController().signal;
async function setup(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'lh-generation-test-'));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const manifest = await initializeProject(root, { title: '分析', subject: '数学', dailyMinutes: 60 });
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['session-a'] }]));
  t.after(() => projects.close()); return { root, manifest, projects };
}

test('workspace canonical text is persistent, deduplicated, searchable in Chinese/English and scoped', async t => {
  const { projects, root, manifest } = await setup(t);
  await projects.use('session-a', signal(), async p => {
    const input = { filename: 'lecture.md', mimeType: 'text/markdown', text: '# 一致连续\n闭区间上的连续函数一致连续。 uniform continuity\n\nsequence limit\n' };
    const first = await p.evidence.importText(p.projectId, input);
    assert.equal((await p.evidence.importText(p.projectId, input)).deduplicated, true);
    for (const query of ['一致连续', 'uniform continuity', '闭区间', 'sequence limit']) {
      const result = p.evidence.search({ courseId: p.projectId, query }); assert.ok(result.results.length);
      assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [result.results[0]!.chunkId] }).chunks.length, 1);
    }
    const source = p.assets.getSource(first.source.id);
    assert.equal(readFileSync(join(root, source.canonicalAsset!), 'utf8'), input.text);
    assert.throws(() => p.assets.search('other', '一致连续', 5, signal()), { code: 'not-found' });
  });
  await projects.close();
  const reopened = new WorkspaceEvidenceStore(root, manifest.projectId);
  try { assert.ok(reopened.search(manifest.projectId, '闭区间', 5, signal()).length); } finally { reopened.close(); }
});

test('active-generation switch retains historical PDF chunks and original page citations after restart', async t => {
  const { root, manifest, projects } = await setup(t); let oldChunk = ''; let sourceId = '';
  await projects.use('session-a', signal(), async p => {
    const contentHash = hashText('original immutable PDF test identity'); const now = new Date().toISOString();
    const source: Source = { id: `src_${hashText(`${p.projectId}:${contentHash}`)}`, courseId: p.projectId,
      filename: 'lecture.pdf', mimeType: 'application/pdf', contentHash, parser: 'pdfjs-test',
      byteSize: 40, chunkCount: 0, pageCount: 2, status: 'processing', createdAt: now, updatedAt: now };
    p.assets.begin(source); sourceId = source.id;
    const chunks = (generation: string, text: string) => [{ id: generationChunkId(source.id, generation, 0), sourceId: source.id,
      courseId: p.projectId, ordinal: 0, locator: { kind: 'pdf' as const, page: 2, block: 0 }, text }];
    const previous = chunks('pdfjs-v1', '旧表示 一致连续'); oldChunk = previous[0]!.id;
    p.assets.activate(source, 'pdfjs-v1', previous);
    p.assets.activate({ ...source, parser: 'mineru-test' }, 'mineru-v2', chunks('mineru-v2', '新表示 一致连续'));
    assert.equal(p.assets.search(p.projectId, '旧表示', 5, signal()).length, 0);
    assert.equal(p.assets.search(p.projectId, '新表示', 5, signal()).length, 1);
    assert.equal(p.assets.read(p.projectId, [oldChunk], signal())[0]!.citationLabel, 'lecture.pdf · p.2');
    const before = p.assets.getSource(source.id);
    assert.throws(() => p.assets.activate(source, 'broken', [{ ...chunks('broken', 'invalid')[0]!, locator: { kind: 'pdf', page: 3, block: 0 } }]), /provenance/);
    assert.deepEqual(p.assets.getSource(source.id), before);
    p.assets.assetization(source.id, 'processing');
  });
  await projects.close();
  const restarted = new WorkspaceEvidenceStore(root, manifest.projectId);
  try {
    assert.equal(restarted.getSource(sourceId).status, 'ready');
    assert.equal(restarted.getSource(sourceId).assetization, 'failed');
    assert.equal(restarted.getSource(sourceId).activeGenerationId, 'mineru-v2');
    assert.equal(restarted.read(manifest.projectId, [oldChunk], signal()).length, 1);
  } finally { restarted.close(); }
});

test('200 workspace sources accepted, 201 rejected; short and trigram searches stay bounded', async t => {
  const { projects } = await setup(t);
  await projects.use('session-a', signal(), async p => {
    for (let i = 0; i < 200; i++) await p.evidence.importText(p.projectId, { filename: `${i}.txt`, mimeType: 'text/plain', text: `一致连续 闭区间 ${i}` });
    assert.equal(p.assets.usage().sourceCount, 200);
    assert.equal(WORKSPACE_LIMITS.sourceWarning, 100);
    assert.throws(() => p.evidence.importText(p.projectId, { filename: '201.txt', mimeType: 'text/plain', text: 'new document' }), { code: 'limit-exceeded' });
    for (const query of ['一致连续', '闭区间', '闭']) assert.equal(p.evidence.search({ courseId: p.projectId, query, limit: 20 }).results.length, 20);
  });
});
