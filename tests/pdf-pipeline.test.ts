import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initializeProject, WorkspaceResolver } from '../src/workspace/context.js';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import type { DocumentVisionProvider } from '../src/services/pdf.js';
import { makePdf } from './pdf-fixture.js';
const signal = () => new AbortController().signal;
async function setup(t: test.TestContext, vision?: DocumentVisionProvider) {
  const root = mkdtempSync(join(tmpdir(), 'lh-pdf-pipeline-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await initializeProject(root, { title: 'PDF course', subject: 'Analysis', dailyMinutes: 60 });
  const resolver = new WorkspaceResolver(() => [{ path: root, sessionIds: ['session'] }]);
  const projects = new WorkspaceProjects(resolver, vision);
  t.after(() => projects.close()); return { root, projects, resolver };
}
test('PDF archive, local page evidence, duplicate import and original validation survive restart', async t => {
  const { root, projects, resolver } = await setup(t);
  const bytes = makePdf([{ text: 'Uniform continuity: every epsilon has a delta independent of x.' }, { text: 'Heine Cantor uses compactness of a closed bounded interval.' }]);
  let id = ''; let reference = '';
  await projects.use('session', signal(), async p => {
    const input = { filename: 'lecture.pdf', mode: 'local-fast' };
    const first = await p.pdf.import(input, bytes, { sessionId: 'session' }, signal()); id = first.source.id;
    assert.equal(first.source.status, 'ready'); assert.equal(first.source.pageCount, 2);
    assert.deepEqual(readFileSync(join(root, first.source.originalAsset!)), Buffer.from(bytes));
    assert.equal((await p.pdf.import(input, bytes, { sessionId: 'session' }, signal())).deduplicated, true);
    const hits = p.evidence.search({ courseId: p.projectId, query: 'compactness' }).results;
    assert.equal(hits[0]!.citationLabel, 'lecture.pdf · p.2'); reference = hits[0]!.chunkId;
    assert.equal((await p.pdf.original({ sourceId: id, pages: [2], reason: 'verify-citation' }, signal())).images.length, 1);
    for (const pages of [[3], [1, 2, 3, 4, 5], [0]]) await assert.rejects(p.pdf.original({ sourceId: id, pages, reason: 'verify-citation' }, signal()));
    const text = await p.evidence.importText(p.projectId, { filename: 'plain.txt', mimeType: 'text/plain', text: 'content' });
    await assert.rejects(p.pdf.original({ sourceId: text.source.id, pages: [1], reason: 'verify-citation' }, signal()));
    await assert.rejects(p.pdf.original({ sourceId: 'src_' + '0'.repeat(64), pages: [1], reason: 'verify-citation' }, signal()));
  });
  await projects.close(); const reopened = new WorkspaceProjects(resolver); t.after(() => reopened.close());
  await reopened.use('session', signal(), p => { assert.equal(p.assets.getSource(id).pageCount, 2); assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [reference] }).chunks[0]!.citationLabel, 'lecture.pdf · p.2'); });
});
test('auto understands only complex pages; high accuracy covers every page; same generation reuses cache', async t => {
  const calls: number[] = [];
  const vision: DocumentVisionProvider = { async available() { return { available: true, cacheKey: 'fake-v1' }; }, async understandPages(_c, pages) {
    calls.push(...pages.map(p => p.page)); return pages.map(p => ({ page: p.page, text: `Verified visual page ${p.page}: 一致连续与公式。` }));
  } };
  const { projects } = await setup(t, vision);
  const bytes = makePdf([{ text: 'A normal page with enough text about uniform continuity and compactness.' }, { image: true }]);
  await projects.use('session', signal(), async p => {
    const run = (mode: string) => p.pdf.import({ filename: 'visual.pdf', mode }, bytes, { sessionId: 'session' }, signal());
    const first = await run('auto'); assert.deepEqual(calls, [2]); assert.match(first.source.parser, /^vision-/);
    const old = p.evidence.search({ courseId: p.projectId, query: 'compactness' }).results[0]!.chunkId;
    const high = await run('high-accuracy'); assert.deepEqual(calls, [2, 1, 2]); assert.equal(high.source.parseWarning, undefined);
    assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [old] }).chunks.length, 1);
    assert.equal((await run('high-accuracy')).deduplicated, true); assert.equal(calls.length, 3);
    p.assets.parsingMetadata(high.source.id, { parseWarning: 'vision-failed' });
    await run('high-accuracy'); assert.equal(calls.length, 3); assert.equal(p.assets.getSource(high.source.id).parseWarning, undefined);
  });
});
test('missing vision and invalid model page cannot corrupt existing local generation', async t => {
  const vision: DocumentVisionProvider = { async available() { return { available: true, cacheKey: 'bad-v1' }; }, async understandPages() { return [{ page: 99, text: 'invented page' }]; } };
  const { projects } = await setup(t, vision);
  const bytes = makePdf([{ text: 'A normal page with enough text about uniform continuity and compactness.' }, { image: true }]);
  await projects.use('session', signal(), async p => {
    const first = await p.pdf.import({ filename: 'bad.pdf', mode: 'local-fast' }, bytes, { sessionId: 'session' }, signal());
    await assert.rejects(p.pdf.import({ filename: 'bad.pdf', mode: 'high-accuracy' }, bytes, { sessionId: 'session' }, signal()), /page identity/);
    const source = p.assets.getSource(first.source.id); assert.equal(source.status, 'ready'); assert.equal(source.activeGenerationId, first.source.activeGenerationId);
    assert.equal(source.parseWarning, 'vision-failed');
  });
  const second = await setup(t);
  await second.projects.use('session', signal(), async p => {
    await assert.rejects(p.pdf.import({ filename: 'no-vision.pdf', mode: 'high-accuracy' }, bytes, { sessionId: 'session' }, signal()), /does not support PDF vision/);
    const source = p.assets.listSources(p.projectId)[0]!; assert.equal(source.status, 'ready'); assert.equal(source.parseWarning, 'vision-unavailable');
  });
});

test('PDF mode switches reactivate cached generations and failed vision preserves the active one', async t => {
  let fail = false; let calls = 0;
  const vision: DocumentVisionProvider = {
    async available() { return { available: true, cacheKey: fail ? 'failing-v2' : 'switch-v1' }; },
    async understandPages(_context, pages) {
      calls += pages.length;
      if (fail) throw new Error('Provider unavailable');
      return pages.map(page => ({ page: page.page, text: `Visual theorem on page ${page.page}: 一致连续。` }));
    },
  };
  const { projects, resolver } = await setup(t, vision);
  const bytes = makePdf([{ text: 'A normal page with enough text about local compactness and continuity.' }, { image: true }]);
  let id = ''; let autoId = ''; let historical = '';
  await projects.use('session', signal(), async p => {
    const run = (mode: string) => p.pdf.import({ filename: 'switch.pdf', mode }, bytes, { sessionId: 'session' }, signal());
    const search = (query: string) => p.evidence.search({ courseId: p.projectId, query }).results;
    const auto = await run('auto'); id = auto.source.id; autoId = auto.source.activeGenerationId!;
    const high = await run('high-accuracy'); historical = search('Visual')[0]!.chunkId;
    assert.notEqual(high.source.activeGenerationId, autoId);
    const local = await run('local-fast');
    assert.match(local.source.parser, /^pdfjs/);
    assert.notEqual(local.source.activeGenerationId, high.source.activeGenerationId);
    assert.equal(search('Visual').length, 0); assert.equal(search('一致连续').length, 0);
    assert.equal(search('compactness').length, 1);
    const cached = await run('auto');
    assert.equal(cached.source.activeGenerationId, autoId); assert.equal(calls, 3);
    assert.equal(search('Visual').length, 1); assert.equal(search('一致连续').length, 1);
    assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [historical] }).chunks.length, 1);
    fail = true;
    await assert.rejects(run('high-accuracy'), /Provider unavailable/);
    assert.equal(p.assets.getSource(id).activeGenerationId, autoId);
    assert.equal(search('Visual').length, 1);
  });
  await projects.close();
  const reopened = new WorkspaceProjects(resolver); t.after(() => reopened.close());
  await reopened.use('session', signal(), p => {
    assert.equal(p.assets.getSource(id).activeGenerationId, autoId);
    assert.equal(p.evidence.search({ courseId: p.projectId, query: '一致连续' }).results.length, 1);
    assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [historical] }).chunks.length, 1);
  });
});

test('vision cancellation preserves local evidence and prevents racing MinerU activation', async t => {
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const vision: DocumentVisionProvider = { async available() { return { available: true, cacheKey: 'cancel-v1' }; },
    async understandPages(_c, _p, signal) { entered(); return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })); } };
  const { projects } = await setup(t, vision);
  await projects.use('session', signal(), async p => {
    const bytes = makePdf([{ text: 'A complete local page about uniform continuity and compactness.' }]);
    const control = new AbortController();
    const importing = p.pdf.import({ filename: 'cancel.pdf', mode: 'high-accuracy' }, bytes, { sessionId: 'session' }, control.signal);
    const rejected = assert.rejects(importing); await started;
    const source = p.assets.listSources(p.projectId)[0]!; assert.equal(source.parsing, 'processing');
    assert.throws(() => p.assetization.start({ sourceId: source.id }, signal()), { code: 'conflict' });
    control.abort(); await rejected;
    assert.equal(p.assets.getSource(source.id).parsing, 'failed');
    assert.equal(p.evidence.search({ courseId: p.projectId, query: 'compactness' }).results.length, 1);
  });
});

test('image-only PDF cannot report local-fast success by retaining its old visual text', async t => {
  const vision: DocumentVisionProvider = {
    async available() { return { available: true, cacheKey: 'image-v1' }; },
    async understandPages(_context, pages) { return pages.map(page => ({ page: page.page, text: 'Visual continuity theorem' })); },
  };
  const { projects } = await setup(t, vision);
  await projects.use('session', signal(), async p => {
    const bytes = makePdf([{ image: true }]);
    const first = await p.pdf.import({ filename: 'scan.pdf', mode: 'high-accuracy' }, bytes, { sessionId: 'session' }, signal());
    await assert.rejects(p.pdf.import({ filename: 'scan.pdf', mode: 'local-fast' }, bytes, { sessionId: 'session' }, signal()), /no locally extractable text/);
    const current = p.assets.getSource(first.source.id);
    assert.equal(current.activeGenerationId, first.source.activeGenerationId);
    assert.equal(current.parsing, 'failed');
    assert.equal(p.evidence.search({ courseId: p.projectId, query: 'Visual' }).results.length, 1);
  });
});
