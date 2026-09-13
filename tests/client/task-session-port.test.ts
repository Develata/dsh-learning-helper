import test from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { taskSessionPort } from '../../src/client/task-session-port.js';
import type { TaskSession } from '../../src/client/task-sessions.js';

function setup(deferredOwnership = false, ownershipTimeoutMs = 5000) {
  const calls: [string, ...unknown[]][] = [];
  const list = { current: 'source', byId: { source: { id: 'source', cwd: '/workspace',
    projectionValues: { agentPreset: 'standard', modelSelection: { next: { provider: 'test', model: 'custom', reasoningEffort: 'high' } } } } } as Record<string, unknown> };
  const workspace = { items: [{ workspaceId: 'workspace', sessionIds: ['source'] }], archivedSessionIds: [] as string[] };
  const nav = new AbortController();
  const listeners = new Set<() => void>();
  const services = { sessions: { list: { getSnapshot: () => list },
    create: async (opts: { sessionId: string }) => { calls.push(['create', opts]); list.byId[opts.sessionId] = { id: opts.sessionId }; if (!deferredOwnership) workspace.items[0]!.sessionIds.push(opts.sessionId); return opts.sessionId; },
    binding: () => ({ session: { rename: async (title: string) => { calls.push(['rename', title]); return { ok: true }; },
      prompt: async (...args: unknown[]) => { calls.push(['prompt', ...args]); return { ok: true }; } } }),
    open: (id: string) => { calls.push(['open', id]); list.current = id; }, refresh: async () => {},
  }, workspaces: { list: { getSnapshot: () => workspace, subscribe: (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; } } }, remote: {
    agentPresets: { select: async (...args: unknown[]) => { assert.equal(args.length, 2); calls.push(['preset', ...args]); return { ok: true }; } },
    session: { selectModel: async (...args: unknown[]) => { assert.equal(args.length, 1); calls.push(['model', ...args]); return { ok: true }; } },
  } };
  const ctx = { get: (key: keyof typeof services) => services[key],
    layout: { beginNavigation: () => nav.signal, selectPanel: (panel: unknown) => { calls.push(['panel', panel]); } },
    sidebarRight: { isExpanded: () => true, toggleExpanded: () => { calls.push(['collapse']); } },
    get conversation() { throw new Error('Original composer must never be accessed'); },
  } as unknown as Context;
  const port = taskSessionPort(ctx, ownershipTimeoutMs);
  const entry: TaskSession = { projectId: 'course', planId: 'plan', taskId: 'task', title: 'topic', prompt: '学习请求',
    sessionId: 'session-new', requestId: 'stable-request', createdAt: new Date().toISOString(), seed: port.capture(), phase: 'created' };
  return { port, calls, entry, nav, workspace, listeners, notify: () => { for (const listener of listeners) listener(); } };
}

test('public Harness adapter captures workspace/preset/model and sends only to the created session', async () => {
  const { port, calls, entry } = setup(); const signal = new AbortController().signal;
  assert.deepEqual(entry.seed, { workspaceId: 'workspace', preset: 'standard', model: { provider: 'test', model: 'custom', reasoningEffort: 'high' } });
  await port.create(entry, signal); await port.prepare(entry, signal); await port.send(entry, signal); await port.open(entry, signal);
  assert.deepEqual(calls.map(c => c[0]), ['create','preset','model','rename','prompt','collapse','open','panel']);
  assert.deepEqual(calls[0]![1], { sessionId: 'session-new', workspaceId: 'workspace' });
  assert.deepEqual(calls.find(c => c[0] === 'prompt')?.slice(1), [[{ type: 'text', text: '学习请求' }], 'queue', signal, 'stable-request']);
});

test('superseded navigation and archived sessions cannot steal focus or silently reopen', async () => {
  const f = setup(); const signal = new AbortController().signal;
  await f.port.create(f.entry, signal); f.nav.abort();
  await assert.rejects(f.port.open(f.entry, signal), /切换页面/);
  assert.equal(f.calls.some(c => c[0] === 'open'), false);
  f.workspace.archivedSessionIds.push(f.entry.sessionId);
  await assert.rejects(f.port.open(f.entry, signal), /归档/);
  assert.equal(f.calls.some(c => c[0] === 'open'), false);
});

test('a task bookmark cannot prepare, send or navigate into another workspace', async () => {
  const f = setup(); const signal = new AbortController().signal; await f.port.create(f.entry, signal);
  f.workspace.items[0]!.workspaceId = 'another-workspace';
  for (const action of [f.port.prepare, f.port.send, f.port.open]) await assert.rejects(action(f.entry, signal), /Workspace/);
  assert.deepEqual(f.calls.map(c => c[0]), ['create']);
});

test('task preparation waits for the independent workspace follow stream after create succeeds', async () => {
  const f = setup(true); const signal = new AbortController().signal;
  await f.port.create(f.entry, signal);
  const preparing = f.port.prepare(f.entry, signal);
  // The create RPC has settled but the Host-authoritative workspace event has not arrived.
  assert.deepEqual(f.calls.map(c => c[0]), ['create']);
  f.workspace.items[0]!.sessionIds.push(f.entry.sessionId); f.notify();
  await preparing;
  assert.deepEqual(f.calls.map(c => c[0]), ['create', 'preset', 'model', 'rename']);
  assert.equal(f.listeners.size, 0);
});

test('missing ownership has a deadline and cancellation removes subscriptions without mutations', async () => {
  const f = setup(true, 10); const controller = new AbortController();
  await f.port.create(f.entry, controller.signal);
  await assert.rejects(f.port.prepare(f.entry, controller.signal), /归属尚未确认/);
  assert.equal(f.listeners.size, 0);
  const sending = f.port.send(f.entry, controller.signal);
  assert.equal(f.listeners.size, 1);
  controller.abort(new Error('cancelled'));
  await assert.rejects(sending, /cancelled/);
  assert.equal(f.listeners.size, 0);
  f.workspace.items[0]!.sessionIds.push(f.entry.sessionId); f.notify();
  assert.deepEqual(f.calls.map(c => c[0]), ['create']);
});

test('late ownership in a different workspace is rejected without opening or sending', async () => {
  const f = setup(true); const signal = new AbortController().signal;
  await f.port.create(f.entry, signal);
  const opening = f.port.open(f.entry, signal);
  f.workspace.items[0]!.workspaceId = 'another-workspace';
  f.workspace.items[0]!.sessionIds.push(f.entry.sessionId); f.notify();
  await assert.rejects(opening, /归属已改变/);
  assert.equal(f.listeners.size, 0);
  assert.deepEqual(f.calls.map(c => c[0]), ['create']);
});

test('navigation changed during ownership confirmation never steals focus', async () => {
  const f = setup(true); const signal = new AbortController().signal;
  await f.port.create(f.entry, signal);
  const opening = f.port.open(f.entry, signal);
  f.nav.abort(); f.workspace.items[0]!.sessionIds.push(f.entry.sessionId); f.notify();
  await assert.rejects(opening, /切换页面/);
  assert.equal(f.listeners.size, 0);
  assert.deepEqual(f.calls.map(c => c[0]), ['create']);
});
