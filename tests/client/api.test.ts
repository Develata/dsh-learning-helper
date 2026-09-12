import test from 'node:test';
import assert from 'node:assert/strict';
import { request, RequestError, errorText } from '../../src/client/api.js';

test('browser requests use same-origin cookies, no token and propagate cancellation', async t => {
  let options: RequestInit | undefined; let url: string | URL | Request | undefined;
  t.mock.method(globalThis, 'fetch', async (input: typeof url, init?: RequestInit) => { url = input; options = init; return Response.json({ ok: true }); });
  const controller = new AbortController();
  assert.deepEqual(await request('/courses/course/dashboard', controller.signal), { ok: true });
  assert.equal(url, '/learning-helper/v1/courses/course/dashboard');
  assert.equal(options?.credentials, 'same-origin'); assert.equal(options?.mode, 'same-origin'); assert.equal(options?.headers, undefined);
  controller.abort(); await assert.rejects(request('/courses', controller.signal), { name: 'AbortError' });
});

test('HTTP errors never expose backend stacks or arbitrary provider text', async t => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ error: { code: 'unavailable', message: 'SECRET STACK /home/private' } }, { status: 503 }));
  await assert.rejects(request('/courses', new AbortController().signal), e => {
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
  const cancelled = request('/courses', caller.signal); caller.abort();
  await assert.rejects(cancelled, { name: 'AbortError' });
  const expired = request('/courses', new AbortController().signal); t.mock.timers.tick(12_000);
  await assert.rejects(expired, { name: 'Error', message: '网络请求未完成，请重试。' });
});
