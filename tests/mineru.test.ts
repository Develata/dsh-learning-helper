import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MinerUAssetizer, awaitMinerU, parseMinerUResult, UnknownMinerUSubmission } from '../src/providers/mineru.js';
import { initializeProject, WorkspaceResolver } from '../src/workspace/context.js';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import { writeConfig } from '../src/workspace/config.js';
import { Assetization } from '../src/services/assetization.js';
import { makePdf } from './pdf-fixture.js';
const signal = () => new AbortController().signal;
const output = () => ({ version: '3.3.0', backend: 'pipeline', results: { document: { md_content: '# 一致连续\nMinerU Markdown\n',
  content_list: JSON.stringify([{ type: 'text', text: 'MinerU 规范化一致连续与紧致性。', page_idx: 0 }, { type: 'equation', text: '$\\epsilon > 0$', page_idx: 0 }]), images: {} } } });
async function server(t: test.TestContext) {
  const state = { submits: 0, reads: 0, protocol: 2, mode: 'ok', status: 'pending', payload: output(), requests: [] as string[] };
  const host = createServer(async (req, res) => {
    state.requests.push(req.url!);
    const send = (status: number, data: unknown) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (req.url === '/health') return send(200, { status: 'healthy', protocol_version: state.protocol });
    if (req.url === '/tasks' && req.method === 'POST') {
      state.submits++; let body = ''; for await (const chunk of req) body += chunk.toString();
      assert.match(body, /name="files"; filename="document.pdf"/); assert.match(body, /name="response_format_zip"\r\n\r\nfalse/);
      if (state.mode === 'drop') { res.destroy(); return; }
      return send(202, { task_id: 'task-1', status: 'pending', status_url: 'http://attacker.invalid', result_url: 'file:///etc/passwd' });
    }
    if (req.url === '/tasks/task-1/result') return send(200, state.payload);
    if (req.url === '/tasks/task-1') {
      if (state.mode === 'lost') return send(404, {});
      state.reads++;
      return send(200, { task_id: 'task-1', status: state.mode === 'wait' ? 'processing' : state.mode === 'failed' ? 'failed' : state.reads < 2 ? 'processing' : 'completed' });
    }
    send(404, {});
  });
  host.listen(0, '127.0.0.1'); await once(host, 'listening');
  t.after(() => { host.closeAllConnections(); host.close(); });
  const port = (host.address() as { port: number }).port;
  const config = { enabled: true, baseUrl: `http://127.0.0.1:${port}`, backend: 'pipeline' as const, timeoutSeconds: 10 };
  return { state, config, adapter: new MinerUAssetizer(config) };
}
test('official MinerU protocol: health, one submit, bounded poll and JSON result without following returned URLs', async t => {
  const { state, adapter } = await server(t);
  await adapter.health(signal()); const task = await adapter.submit(makePdf([{ text: 'test' }]), signal());
  await awaitMinerU(adapter, task, signal(), 1);
  const parsed = await adapter.result(task.task_id, 1, signal()); assert.equal(parsed.blocks.length, 2); assert.equal(parsed.blocks[0]!.page, 1);
  assert.equal(state.submits, 1); assert.ok(state.requests.every(p => p.startsWith('/tasks') || p === '/health'));
  state.protocol = 1; await assert.rejects(adapter.health(signal()), /protocol 2/);
});
test('MinerU failed/lost tasks, cancellation and unknown submission terminate without automatic POST retry', async t => {
  const { state, adapter } = await server(t);
  state.mode = 'failed'; await assert.rejects(awaitMinerU(adapter, { task_id: 'task-1', status: 'pending' }, signal(), 1), /failed or was lost/);
  state.mode = 'lost'; await assert.rejects(adapter.status('task-1', signal()), /failed or was lost/);
  state.mode = 'wait'; await assert.rejects(awaitMinerU(adapter, { task_id: 'task-1', status: 'pending' }, AbortSignal.timeout(30), 5));
  state.mode = 'drop'; await assert.rejects(adapter.submit(makePdf([{ text: 'test' }]), signal()), UnknownMinerUSubmission); assert.equal(state.submits, 1);
});
test('MinerU output validation rejects false pages, unsafe media, missing media and malformed/oversized text', () => {
  const badPage = output(); badPage.results.document.content_list = JSON.stringify([{ type: 'text', text: 'bad', page_idx: 1 }]);
  assert.throws(() => parseMinerUResult(badPage, 1), /page exceeds/);
  for (const name of ['../escape.png', '/tmp/x.png', 'a\\b.png']) {
    const result = output(); result.results.document.images = { [name]: 'data:image/png;base64,YQ==' };
    assert.throws(() => parseMinerUResult(result, 1), /Unsafe/);
  }
  const missing = output(); missing.results.document.content_list = JSON.stringify([{ type: 'image', page_idx: 0, img_path: 'images/missing.png' }]);
  assert.throws(() => parseMinerUResult(missing, 1), /missing or unsafe/);
  const malformed = output(); malformed.results.document.content_list = 'not json'; assert.throws(() => parseMinerUResult(malformed, 1));
  const nul = output(); nul.results.document.md_content = '\0'; assert.throws(() => parseMinerUResult(nul, 1));
});
test('MinerU generation switch preserves archived PDF and old citations; duplicate action submits once', async t => {
  const { state, adapter, config } = await server(t);
  const root = mkdtempSync(join(tmpdir(), 'lh-mineru-')); t.after(() => rmSync(root, { force: true, recursive: true }));
  await initializeProject(root, { title: 'PDF', subject: 'Analysis', dailyMinutes: 60 });
  writeConfig(root, { schemaVersion: 2, documentParsing: { pdfMode: 'local-fast', mineru: config } });
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['s'] }])); t.after(() => projects.close());
  await projects.use('s', signal(), async p => {
    const bytes = makePdf([{ text: 'Original local representation of uniform continuity and compactness.' }]);
    const imported = await p.pdf.import({ filename: 'lesson.pdf', mode: 'local-fast' }, bytes, { sessionId: 's' }, signal());
    const sourceId = imported.source.id; const old = p.evidence.search({ courseId: p.projectId, query: 'Original' }).results[0]!;
    const service = new Assetization(root, p.assets, () => adapter, 1); t.after(() => service.close());
    const first = service.start({ sourceId }, signal()); const retry = service.start({ sourceId }, signal());
    assert.equal(first.done, retry.done); await first.done;
    const current = p.assets.getSource(sourceId); assert.equal(current.assetization, 'ready'); assert.match(current.parser, /^mineru-/);
    assert.equal(p.evidence.search({ courseId: p.projectId, query: 'Original' }).results.length, 0);
    const now = p.evidence.search({ courseId: p.projectId, query: '一致连续' }).results[0]!; assert.equal(now.citationLabel, 'lesson.pdf · p.1');
    assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [old.chunkId] }).chunks[0]!.canonicalRef, old.canonicalRef);
    assert.deepEqual(readFileSync(join(root, current.originalAsset!)), Buffer.from(bytes));
    assert.match(readFileSync(join(root, current.canonicalAsset!), 'utf8'), /MinerU/);
    assert.equal(service.start({ sourceId }, signal()).accepted, false); assert.equal(state.submits, 1);
  });
});

test('restart of an already failed MinerU job preserves the durable source snapshot', async t => {
  const { state, adapter, config } = await server(t); state.mode = 'failed';
  const root = mkdtempSync(join(tmpdir(), 'lh-mineru-restart-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  await initializeProject(root, { title: 'PDF', subject: 'Analysis', dailyMinutes: 60 });
  writeConfig(root, { schemaVersion: 2, documentParsing: { pdfMode: 'local-fast', mineru: config } });
  const resolver = new WorkspaceResolver(() => [{ path: root, sessionIds: ['s'] }]);
  const projects = new WorkspaceProjects(resolver); t.after(() => projects.close());
  let sourceId = ''; let before: unknown;
  await projects.use('s', signal(), async p => {
    const imported = await p.pdf.import({ filename: 'failed-conversion.pdf', mode: 'local-fast' },
      makePdf([{ text: 'Local evidence remains available after conversion fails.' }]), { sessionId: 's' }, signal());
    sourceId = imported.source.id;
    const service = new Assetization(root, p.assets, () => adapter, 1);
    try { await assert.rejects(service.start({ sourceId }, signal()).done, /failed or was lost/); }
    finally { await service.close(); }
    before = p.assets.getSource(sourceId);
    assert.equal(p.assets.getSource(sourceId).assetization, 'failed');
  });
  await projects.close();
  // A later restart is a read/recovery operation, not another failed conversion.
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() + 10_000 });
  const reopened = new WorkspaceProjects(resolver); t.after(() => reopened.close());
  await reopened.use('s', signal(), p => { assert.deepEqual(p.assets.getSource(sourceId), before); });
});
