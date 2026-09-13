import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MinerUCloudAssetizer, cloudAssetUrl } from '../src/providers/mineru-cloud.js';
import { readMinerUZip } from '../src/providers/mineru-zip.js';
import { UnknownMinerUSubmission, awaitMinerU } from '../src/providers/mineru.js';
import { mineruConfigSchema, writeConfig } from '../src/workspace/config.js';
import { makePdf } from './pdf-fixture.js';
import { WorkspaceResolver, initializeProject } from '../src/workspace/context.js';
import { WorkspaceProjects } from '../src/workspace/projects.js';

/** Copyright-safe stored ZIP fixture. Production uses yauzl; this only writes tiny test inputs. */
function zip(entries: [string, string | Buffer][], options: { checksum?: number; declaredSize?: number; attributes?: number } = {}) {
  const bodies: Buffer[] = []; const records: Buffer[] = []; let offset = 0;
  for (const [name, raw] of entries) {
    const filename = Buffer.from(name); const data = Buffer.from(raw); const crc = options.checksum ?? crc32(data);
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18); local.writeUInt32LE(options.declaredSize ?? data.length, 22); local.writeUInt16LE(filename.length, 26);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(0x314, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(options.declaredSize ?? data.length, 24);
    central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(options.attributes ?? 0, 38); central.writeUInt32LE(offset, 42);
    bodies.push(local, filename, data); records.push(central, filename); offset += local.length + filename.length + data.length;
  }
  const cd = Buffer.concat(records); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...bodies, cd, end]);
}
const signal = () => AbortSignal.timeout(10_000);
const content = JSON.stringify([{ type: 'text', page_idx: 0, text: '一致连续的 MinerU 云端课程证据' }]);
const archive = () => zip([['full.md', '# 一致连续'], ['document_content_list.json', content]]);

test('cloud v4 config is opt-in; legacy self-hosted config remains valid; cloud cannot redirect API keys', () => {
  assert.ok(mineruConfigSchema.safeParse({ enabled: true, baseUrl: 'http://localhost:8000' }).success);
  assert.ok(mineruConfigSchema.safeParse({ enabled: true, provider: 'cloud' }).success);
  assert.ok(!mineruConfigSchema.safeParse({ enabled: true, provider: 'cloud', baseUrl: 'https://attacker.example' }).success);
  for (const url of ['http://127.0.0.1/a', 'https://169.254.169.254/a', 'https://mineru.oss-cn-shanghai.aliyuncs.com.evil.test/a',
    'https://user:secret@cdn-mineru.openxlab.org.cn/a', 'https://cdn-mineru.openxlab.org.cn:8443/a', 'file:///etc/passwd']) {
    assert.throws(() => cloudAssetUrl(url, 'result'));
  }
  assert.equal(cloudAssetUrl('https://mineru.oss-cn-shanghai.aliyuncs.com/api-upload/a?signature=fixture', 'upload'), 'https://mineru.oss-cn-shanghai.aliyuncs.com/api-upload/a?signature=fixture');
});

test('official cloud upload/poll/ZIP flow uses bearer only on API, and returns grounded page content', async t => {
  const requests: { path: string; auth?: string; method: string }[] = []; let polls = 0; let allocated = 0;
  const pdf = makePdf([{ text: 'Uniform continuity from a compact interval.' }]);
  const server = createServer(async (req, res) => {
    requests.push({ path: req.url!, method: req.method!, ...(req.headers.authorization ? { auth: req.headers.authorization } : {}) });
    const send = (value: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(value)); };
    if (req.url === '/api/v4/file-urls/batch') {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c);
      const body = JSON.parse(Buffer.concat(chunks).toString()); assert.equal(body.model_version, 'vlm'); assert.equal(body.files.length, 1); allocated++;
      return send({ code: 0, data: { batch_id: 'batch-1', file_urls: ['https://mineru.oss-cn-shanghai.aliyuncs.com/upload'] } });
    }
    if (req.url === '/upload') {
      const chunks: Buffer[] = []; for await (const c of req) chunks.push(c); assert.deepEqual(Buffer.concat(chunks), Buffer.from(pdf));
      res.end(); return;
    }
    if (req.url === '/api/v4/extract-results/batch/batch-1') return send({ code: 0, data: { batch_id: 'batch-1', extract_result: [{
      file_name: 'document.pdf', data_id: 'learning-helper-document', state: ++polls < 2 ? 'converting' : 'done', full_zip_url: 'https://cdn-mineru.openxlab.org.cn/result.zip',
    }] } });
    if (req.url === '/result.zip') { res.end(archive()); return; }
    res.statusCode = 404; res.end();
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const transport: typeof fetch = (url, init) => fetch(base + new URL(String(url)).pathname, init);
  const adapter = new MinerUCloudAssetizer('fixture-token', 'vlm', transport);
  await adapter.health(signal()); const task = await adapter.submit(pdf, signal());
  await awaitMinerU(adapter, task, signal(), 1); const result = await adapter.result(task.task_id, 1, signal());
  assert.equal(allocated, 1); assert.equal(result.blocks[0]!.page, 1); assert.match(result.blocks[0]!.text, /一致连续/);
  assert.ok(requests.filter(r => r.path.startsWith('/api/')).every(r => r.auth === 'Bearer fixture-token'));
  assert.ok(requests.filter(r => !r.path.startsWith('/api/')).every(r => !r.auth));
  const root = mkdtempSync(join(tmpdir(), 'lh-cloud-generation-'));
  await initializeProject(root, { title: 'Cloud PDF', subject: 'Analysis', dailyMinutes: 60 });
  writeConfig(root, { schemaVersion: 2, documentParsing: { pdfMode: 'local-fast', mineru: { enabled: true, provider: 'cloud' } } });
  let projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['s'] }]), undefined, () => adapter);
  t.after(async () => { await projects.close(); rmSync(root, { recursive: true, force: true }); });
  let oldChunk = ''; let originalRef = ''; let sourceId = '';
  await projects.use('s', signal(), async p => {
    sourceId = (await p.pdf.import({ filename: 'lecture.pdf', mode: 'local-fast' }, pdf, { sessionId: 's' }, signal())).source.id;
    const old = p.evidence.search({ courseId: p.projectId, query: 'compact' }).results[0]!; oldChunk = old.chunkId; originalRef = old.canonicalRef;
    const first = p.assetization.start({ sourceId }, signal()); const second = p.assetization.start({ sourceId }, signal());
    assert.equal(first.done, second.done); await first.done;
    const source = p.assets.getSource(sourceId); assert.equal(source.assetization, 'ready'); assert.equal(source.parser, 'mineru-cloud-v4-vlm');
    assert.match(readFileSync(join(root, source.canonicalAsset!), 'utf8'), /一致连续/);
    assert.deepEqual(readFileSync(join(root, source.originalAsset!)), Buffer.from(pdf));
    assert.equal(p.evidence.search({ courseId: p.projectId, query: 'compact' }).results.length, 0);
    assert.equal(p.evidence.search({ courseId: p.projectId, query: '一致连续' }).results[0]!.citationLabel, 'lecture.pdf · p.1');
    assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [oldChunk] }).chunks[0]!.canonicalRef, originalRef);
    assert.equal(p.assetization.start({ sourceId }, signal()).accepted, false);
  });
  assert.equal(allocated, 2, 'one direct adapter test and exactly one complete generation job');
  await projects.close();
  projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['s'] }]), undefined, () => adapter);
  await projects.use('s', signal(), p => {
    assert.equal(p.assets.getSource(sourceId).assetization, 'ready');
    assert.equal(p.evidence.read({ courseId: p.projectId, chunkIds: [oldChunk] }).chunks[0]!.canonicalRef, originalRef);
  });
});

test('cloud rejects PDFs over 200 pages before creating a remote task, preserving local evidence', async t => {
  const root = mkdtempSync(join(tmpdir(), 'lh-cloud-pages-')); let calls = 0;
  await initializeProject(root, { title: 'Page bounds', subject: 'Math', dailyMinutes: 60 });
  writeConfig(root, { schemaVersion: 2, documentParsing: { pdfMode: 'local-fast', mineru: { enabled: true, provider: 'cloud' } } });
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['s'] }]), undefined, () => { calls++; throw new Error('must not create cloud adapter'); });
  t.after(async () => { await projects.close(); rmSync(root, { recursive: true, force: true }); });
  await projects.use('s', signal(), async p => {
    const pdf = makePdf(Array.from({ length: 201 }, (_, n) => ({ text: `Mathematical theorem in local page ${n + 1}.` })));
    const result = await p.pdf.import({ filename: 'large.pdf', mode: 'local-fast' }, pdf, { sessionId: 's' }, signal());
    assert.equal(result.source.pageCount, 201);
    assert.throws(() => p.assetization.start({ sourceId: result.source.id }, signal()), /200 PDF pages/);
    assert.ok(p.evidence.search({ courseId: p.projectId, query: 'theorem' }).results.length > 0);
  });
  assert.equal(calls, 0);
});

test('cloud failures are bounded, reject bad keys, and never blindly repeat unknown allocations', async () => {
  let calls = 0;
  const drop: typeof fetch = async () => { calls++; throw new Error('lost response with sensitive URL'); };
  await assert.rejects(new MinerUCloudAssetizer('fixture', 'vlm', drop).submit(new Uint8Array([1]), signal()), UnknownMinerUSubmission);
  assert.equal(calls, 1);
  const denied: typeof fetch = async () => new Response(JSON.stringify({ code: 'A0202', msg: 'sensitive remote message' }), { status: 401 });
  await assert.rejects(new MinerUCloudAssetizer('fixture', 'vlm', denied).submit(new Uint8Array([1]), signal()), /check API key/);
  const oversized: typeof fetch = async () => new Response('{}', { headers: { 'content-length': '999999999' } });
  await assert.rejects(new MinerUCloudAssetizer('fixture', 'vlm', oversized).status('batch-1', signal()), /exceeds limit/);
  const mismatch: typeof fetch = async () => Response.json({ code: 0, data: { batch_id: 'different', extract_result: [{ file_name: 'document.pdf', data_id: 'learning-helper-document', state: 'done' }] } });
  await assert.rejects(new MinerUCloudAssetizer('fixture', 'vlm', mismatch).status('batch-1', signal()), /identity mismatch/);
  const lost: typeof fetch = async () => Response.json({ code: -60012 });
  await assert.rejects(new MinerUCloudAssetizer('fixture', 'vlm', lost).status('batch-1', signal()), /failed or was lost/);
  let badUploadCalls = 0;
  const malicious: typeof fetch = async () => { badUploadCalls++; return Response.json({ code: 0, data: { batch_id: 'batch-1', file_urls: ['https://127.0.0.1/private'] } }); };
  await assert.rejects(new MinerUCloudAssetizer('fixture', 'vlm', malicious).submit(new Uint8Array([1]), signal()), UnknownMinerUSubmission);
  assert.equal(badUploadCalls, 1, 'never PUT an archived PDF to an untrusted address');
  await assert.rejects(new MinerUCloudAssetizer('fixture').health(AbortSignal.abort()));
});

test('cloud ZIP validates CRC, UTF-8, paths, byte/count quotas, symlinks and original page provenance', async () => {
  assert.equal((await readMinerUZip(archive(), 1, 'vlm', signal())).blocks[0]!.page, 1);
  await assert.rejects(readMinerUZip(archive(), 0, 'vlm', signal()), /page exceeds/);
  for (const name of ['../escape', '/etc/passwd', 'images\\bad.png', './full.md']) {
    await assert.rejects(readMinerUZip(zip([[name, 'bad']]), 1, 'vlm', signal()));
  }
  await assert.rejects(readMinerUZip(zip([['full.md', 'bad']], { attributes: 0xa0000000 }), 1, 'vlm', signal()), /Unsafe/);
  await assert.rejects(readMinerUZip(zip([['full.md', 'bad']], { checksum: 1 }), 1, 'vlm', signal()), /checksum/);
  await assert.rejects(readMinerUZip(zip([['full.md', Buffer.from([0xff])]]), 1, 'vlm', signal()), /Invalid/);
  await assert.rejects(readMinerUZip(zip([['full.md', 'a'], ['full.md', 'b']]), 1, 'vlm', signal()), /Unsafe/);
  await assert.rejects(readMinerUZip(zip([['full.md', 'a'.repeat(8 * 1024 * 1024 + 1)]]), 1, 'vlm', signal()), /size exceeded/);
  await assert.rejects(readMinerUZip(zip(Array.from({ length: 1025 }, (_, i) => [`ignored-${i}`, 'a'])), 1, 'vlm', signal()), /Too many/);
  await assert.rejects(readMinerUZip(archive(), 1, 'vlm', AbortSignal.abort()));
  await assert.rejects(readMinerUZip(zip([['full.md', '# Missing provenance']]), 1, 'vlm', signal()), /lacks/);
});


test('cloud transport and malformed response diagnostics cannot leak signed URLs or secret-bearing response text', async () => {
  const transport: typeof fetch = async () => { throw new Error('https://cdn-mineru.openxlab.org.cn/a?signature=PRIVATE_SIGNATURE'); };
  for (const fetcher of [transport, (async () => new Response('PRIVATE_RESPONSE-not-json')) as typeof fetch]) {
    const adapter = new MinerUCloudAssetizer('fixture-token', 'vlm', fetcher);
    await assert.rejects(adapter.status('batch-1', signal()), error => {
      assert.doesNotMatch(String(error), /PRIVATE|signature|fixture-token/);
      assert.match(String(error), /MinerU/); return true;
    });
  }
});
