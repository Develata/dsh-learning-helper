import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createHandler } from '../src/host/http.js';
import { EvidenceService } from '../src/services/evidence.js';
import { SqliteEvidenceStore } from '../src/providers/evidence-sqlite.js';
import { TextParser } from '../src/providers/text-parser.js';
import { openLearning } from './helpers.js';

async function fixture(t: test.TestContext) {
  const h = await openLearning(); const evidence = new EvidenceService(h.service, new SqliteEvidenceStore(':memory:'), new TextParser());
  const errors: unknown[] = [];
  const server = createServer(createHandler(h.service, e => errors.push(e), req => req.headers.authorization === 'test' ? undefined : 401, evidence));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); await evidence.close(); await h.close(); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/learning-helper/v1`;
  const call = (path: string, body?: unknown, authenticated = true) => fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
    headers: { 'content-type': 'application/json', ...(authenticated ? { authorization: 'test' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000) });
  return { ...h, evidence, call, base, errors };
}
test('authenticated Host creates empty courses and imports text above 64 KiB without relaxing ordinary bodies', async t => {
  const h = await fixture(t);
  const draft = { id: 'math', title: 'Analysis', subject: 'calculus', dailyMinutes: 60 };
  assert.equal((await h.call('/courses', draft, false)).status, 401);
  const created = await h.call('/courses', draft); assert.equal(created.status, 201);
  const body = await created.json(); assert.deepEqual(Object.keys(body), ['course']);
  assert.equal((await (await h.call('/courses/math/state')).json()).plan, null);
  const material = { filename: 'notes.txt', mimeType: 'text/plain', text: '一致连续 uniform continuity\n'.repeat(4000) };
  const imported = await h.call('/courses/math/sources/text', material); assert.equal(imported.status, 201, await imported.clone().text());
  assert.equal((await h.call('/courses/math/sources/text', material)).status, 200);
  const sources = await (await h.call('/courses/math/sources')).json(); assert.equal(sources.sources.length, 1);
  const search = await (await h.call('/courses/math/evidence/search?query=一致连续&limit=2')).json(); assert.equal(search.results.length, 2);
  const read = await h.call('/courses/math/evidence/read', { chunkIds: [search.results[0].chunkId] }); assert.equal(read.status, 200);
  assert.equal((await read.json()).chunks[0].canonicalRef, search.results[0].canonicalRef);
  assert.equal((await h.call('/courses', { ...draft, id: 'large', title: 'a'.repeat(70_000) })).status, 413);
  assert.equal((await h.call('/courses/math/sources/text', { ...material, text: 'x'.repeat(600_000) })).status, 400);
  assert.equal((await h.call('/courses/math/sources/text', { ...material, text: 'x'.repeat(4_194_305) })).status, 413);
  assert.equal((await h.call('/courses/math/evidence/read', { chunkIds: [], courseId: 'other' })).status, 400);
  assert.equal((await h.call('/courses/math/sources', undefined, false)).status, 401);
  assert.equal(h.store.get('math')!.attempts.length, 0); assert.deepEqual(h.errors, []);
});
