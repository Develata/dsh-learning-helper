import test from 'node:test';
import assert from 'node:assert/strict';
import type { Context } from '@deepseek-ai/cordis';
import { taskSessionPort } from '../../src/client/task-session-port.js';
import type { TaskSession } from '../../src/client/task-sessions.js';

function setup() {
  const calls: [string, ...unknown[]][] = [];
  const list = { current: 'source', byId: { source: { id: 'source', cwd: '/workspace',
    projectionValues: { agentPreset: 'standard', modelSelection: { next: { provider: 'test', model: 'custom', reasoningEffort: 'high' } } } } } as Record<string, unknown> };
  const workspace = { items: [{ workspaceId: 'workspace', sessionIds: ['source'] }], archivedSessionIds: [] as string[] };
  const nav = new AbortController();
  const services = { sessions: { list: { getSnapshot: () => list },
    create: async (opts: { sessionId: string }) => { calls.push(['create', opts]); list.byId[opts.sessionId] = { id: opts.sessionId }; return opts.sessionId; },
    binding: () => ({ session: { rename: async (title: string) => { calls.push(['rename', title]); return { ok: true }; },
      prompt: async (...args: unknown[]) => { calls.push(['prompt', ...args]); return { ok: true }; } } }),
    open: (id: string) => { calls.push(['open', id]); list.current = id; }, refresh: async () => {},
  }, workspaces: { list: { getSnapshot: () => workspace } }, remote: {
    agentPresets: { select: async (...args: unknown[]) => { assert.equal(args.length, 2); calls.push(['preset', ...args]); return { ok: true }; } },
    session: { selectModel: async (...args: unknown[]) => { assert.equal(args.length, 1); calls.push(['model', ...args]); return { ok: true }; } },
  } };
  const ctx = { get: (key: keyof typeof services) => services[key],
    layout: { beginNavigation: () => nav.signal, selectPanel: (panel: unknown) => { calls.push(['panel', panel]); } },
    sidebarRight: { isExpanded: () => true, toggleExpanded: () => { calls.push(['collapse']); } },
    get conversation() { throw new Error('Original composer must never be accessed'); },
  } as unknown as Context;
  const port = taskSessionPort(ctx);
  const entry: TaskSession = { courseId: 'course', planId: 'plan', taskId: 'task', title: 'topic', prompt: '学习请求',
    sessionId: 'session-new', requestId: 'stable-request', createdAt: new Date().toISOString(), seed: port.capture(), phase: 'created' };
  return { port, calls, entry, nav, workspace };
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
