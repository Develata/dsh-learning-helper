import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createHandler } from '../src/host/http.js';
import { demoCourse, demoSubmission } from '../src/presets/math-analysis/demo.js';
import { openLearning } from './helpers.js';

async function httpFixture(t: test.TestContext, rejection?: 401 | 403) {
  const h = await openLearning(); await h.service.create(demoCourse());
  const errors: unknown[] = [];
  const server = createServer(createHandler(h.service, e => errors.push(e), () => rejection));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const port = (server.address() as AddressInfo).port;
  t.after(async () => { server.closeAllConnections(); await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())); await h.close(); });
  const base = `http://127.0.0.1:${port}`;
  const submit = (body: unknown = demoSubmission(), headers = {}) => fetch(`${base}/learning-helper/v1/courses/demo-calculus/submissions`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  return { ...h, errors, base, port, submit };
}

test('Host read → submit → feedback → state exposes real adaptation and hides pre-submit keys', { timeout: 10_000 }, async t => {
  const h = await httpFixture(t);
  const quiz = await fetch(`${h.base}/learning-helper/v1/courses/demo-calculus/quizzes/day-1`);
  assert.equal(quiz.status, 200); assert.doesNotMatch(await quiz.text(), /correctOption|explanation/);
  const result = await h.submit(demoSubmission(), { origin: h.base }); assert.equal(result.status, 200);
  const body = await result.json(); assert.equal(body.receipt.revision.newVersion, 2); assert.equal(body.feedback.length, 5);
  const state = await (await fetch(`${h.base}/learning-helper/v1/courses/demo-calculus/state`)).json();
  assert.equal(state.conceptStates[3].status, 'weak'); assert.equal(state.plan.version, 2);
  assert.equal((await h.submit()).status, 200); assert.equal(h.store.get('demo-calculus')!.attempts.length, 5);
  assert.deepEqual(h.errors, []);
});

test('Host rejects malformed and oversize submissions without touching learning evidence', { timeout: 10_000 }, async t => {
  const h = await httpFixture(t);
  assert.equal((await h.submit({ ...demoSubmission(), mastery: 1 })).status, 400);
  assert.equal((await h.submit(demoSubmission(), { 'content-type': 'text/plain' })).status, 400);
  assert.equal((await h.submit({ oversized: 'x'.repeat(66_000) })).status, 413);
  const bad = await fetch(`${h.base}/learning-helper/v1/courses/demo-calculus/submissions`, { method: 'POST', body: '{', headers: { 'content-type': 'application/json' } });
  assert.equal(bad.status, 400); assert.equal(h.store.get('demo-calculus')!.attempts.length, 0);
  assert.equal((await h.submit()).status, 200);
});

test('unknown resources/methods and conflicting submissions return stable HTTP failures', { timeout: 10_000 }, async t => {
  const h = await httpFixture(t);
  assert.equal((await fetch(`${h.base}/learning-helper/v1/unknown`)).status, 404);
  assert.equal((await fetch(`${h.base}/learning-helper/v1/courses/missing/state`)).status, 404);
  assert.equal((await fetch(`${h.base}/learning-helper/v1/courses/demo-calculus/state`, { method: 'POST' })).status, 405);
  await h.submit();
  const response = await h.submit({ ...demoSubmission(), submissionId: 'other' });
  assert.equal(response.status, 409); assert.equal((await response.json()).error.code, 'conflict');
});

test('partial request body expires within the documented 10-second bound', { timeout: 15_000 }, async t => {
  const h = await httpFixture(t); const start = Date.now();
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port: h.port, path: '/learning-helper/v1/courses/demo-calculus/submissions',
      method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '999' } }, res => {
      res.resume(); res.on('end', () => { req.destroy(); resolve(res.statusCode); });
    });
    req.on('error', reject); req.write('{');
  });
  assert.equal(status, 400); assert.ok(Date.now() - start < 12_000);
  assert.equal(h.store.get('demo-calculus')!.attempts.length, 0);
});

test('Harness request rejection gates every learning route before reads or writes', { timeout: 10_000 }, async t => {
  for (const rejection of [401, 403] as const) {
    const h = await httpFixture(t, rejection);
    for (const path of ['/health', '/courses/demo-calculus/state', '/courses/demo-calculus/quizzes/day-1']) {
      assert.equal((await fetch(`${h.base}/learning-helper/v1${path}`)).status, rejection);
    }
    assert.equal((await h.submit()).status, rejection);
    assert.equal(h.store.get('demo-calculus')!.attempts.length, 0);
  }
});
