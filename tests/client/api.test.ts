import test from 'node:test';
import assert from 'node:assert/strict';
import { request, RequestError, errorText } from '../../src/client/api.js';

test('browser requests use same-origin cookies, no token and propagate cancellation', async t => {
  let options: RequestInit | undefined; let url: string | URL | Request | undefined;
  t.mock.method(globalThis, 'fetch', async (input: typeof url, init?: RequestInit) => { url = input; options = init; return Response.json({ ok: true }); });
  const controller = new AbortController();
  assert.deepEqual(await request('/sessions/session/dashboard', controller.signal), { ok: true });
  assert.equal(url, '/learning-helper/v2/sessions/session/dashboard');
  assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.mode, 'same-origin'); assert.equal(options?.headers, undefined);
  controller.abort(); await assert.rejects(request('/sessions/session/project', controller.signal), { name: 'AbortError' });
});

test('HTTP errors never expose backend stacks or arbitrary provider text', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'unavailable', message: 'SECRET STACK /home/private' } }, { status: 503 }));
  await assert.rejects(request('/sessions/session/project', new AbortController().signal), e => {
    assert.ok(e instanceof RequestError); assert.doesNotMatch(e.message, /SECRET|STACK|home/); return true;
  });
  assert.equal(errorText(new Error('PRIVATE')), '操作未完成，请重试。');
});

test('in-flight browser request aborts on caller cancellation and the twelve-second deadline', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', (_: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener('abort', () => reject(options.signal!.reason), { once: true });
  }));
  const caller = new AbortController();
  const cancelled = request('/sessions/session/project', caller.signal); caller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  const expired = request('/sessions/session/project', new AbortController().signal); t.mock.timers.tick(12_000);
  await assert.rejects(expired, { name: 'Error', message: '网络请求未完成，请重试。' });
});

test('binary PDF upload has a forty-five-second deadline and still honors caller cancellation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let uploadSignal: AbortSignal | undefined;
  t.mock.method(globalThis, 'fetch', (_: unknown, options: RequestInit) => new Promise((_resolve, reject) => {
    uploadSignal = options.signal!;
    uploadSignal.addEventListener('abort', () => reject(uploadSignal!.reason), { once: true });
  }));
  const pending = request('/sessions/session/sources/pdf', new AbortController().signal, new Blob(['pdf']), true);
  const rejected = assert.rejects(pending, { message: '网络请求未完成，请重试。' });
  t.mock.timers.tick(12_000); assert.equal(uploadSignal!.aborted, false);
  t.mock.timers.tick(33_000); await rejected;
  const caller = new AbortController();
  const cancelled = request('/sessions/session/sources/pdf', caller.signal, new Blob(['pdf']), true);
  caller.abort(); await assert.rejects(cancelled, { name: 'AbortError' });
});
