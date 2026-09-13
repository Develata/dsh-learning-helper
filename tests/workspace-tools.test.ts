import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { WorkspaceResolver } from '../src/workspace/context.js';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import { registerWorkspaceTools } from '../src/tools/workspace-tools.js';
import { workspaceHandler } from '../src/host/workspace-http.js';
import { groundedDrafts } from './authoring-helpers.js';
import type { EvidenceHit } from '../src/domain/evidence.js';
import { toolCardModel } from '../src/client/tool-model.js';

test('session-bound real ToolRuntime and authenticated HTTP connect workspace evidence to adaptive learning', { timeout: 20_000 }, async t => {
  const parent = mkdtempSync(join(tmpdir(), 'lh-workspace-tools-')); const a = join(parent, 'a'); const b = join(parent, 'b'); mkdirSync(a); mkdirSync(b);
  const memberships = [{ path: a, sessionIds: ['session-a'] }, { path: b, sessionIds: ['session-b'] }];
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => memberships));
  const ctx = new Context(); await ctx.plugin(SystemPrompt); await ctx.plugin(ToolRuntime);
  registerWorkspaceTools(ctx, projects);
  const errors: unknown[] = [];
  const server = createServer(workspaceHandler(projects, req => req.headers.authorization === 'fixture' ? undefined : 401, error => errors.push(error)));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); await ctx.fiber.dispose(); await projects.close(); rmSync(parent, { force: true, recursive: true }); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/learning-helper/v2`;
  const http = (session: string, path: string, body?: unknown, auth = true) => fetch(`${base}/sessions/${session}/${path}`, {
    method: body === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'fixture' } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10_000),
  });
  let call = 0;
  // The fake supplies only Agent identity to the genuine runtime; full Harness lifecycle is a separate packed gate.
  const agents = { 'session-a': { session: { id: 'session-a' } } as unknown as Agent, 'session-b': { session: { id: 'session-b' } } as unknown as Agent };
  const dispatch = (name: string, args: unknown, session: keyof typeof agents = 'session-a') => ctx.tools.execute({ name, arguments: args,
    callId: ToolCallId(`workspace-${++call}`), agent: agents[session], signal: new AbortController().signal });
  const invoke = async (name: string, args: unknown) => { const r = await dispatch(name, args); assert.equal(r.isError, false, JSON.stringify(r)); return r.value; };
  assert.equal((await http('session-a', 'project', undefined, false)).status, 401);
  assert.equal((await http('session-a', 'project')).status, 200);
  assert.equal((await http('missing', 'project')).status, 503);
  for (const session of ['session-a', 'session-b']) assert.equal((await http(session, 'project', { title: session, subject: '分析', dailyMinutes: 60 })).status, 201);
  const input = { filename: 'lecture.md', mimeType: 'text/markdown', text: readFileSync(new URL('../demo/math-analysis/lecture-03.md', import.meta.url), 'utf8') };
  assert.equal((await http('session-a', 'sources/text', input)).status, 201);
  assert.equal((await http('session-b', 'sources/text', { ...input, text: 'Only workspace B contains this secret topic.' })).status, 201);
  assert.deepEqual(ctx.tools.schemas().map(t => t.name).sort(), ['course_original_read', 'course_outline_publish', 'course_read', 'course_search', 'learning_state_get', 'quiz_publish', 'study_plan_publish']);
  for (const schema of ctx.tools.schemas()) assert.doesNotMatch(JSON.stringify(schema.parameters), /courseId|workspaceRoot|workspaceId/);
  assert.equal((await dispatch('course_list', {})).isError, true);
  assert.equal((await dispatch('course_search', { query: '一致连续', courseId: 'other' })).isError, true);
  const hits = await invoke('course_search', { query: '一致连续' }) as unknown as { results: EvidenceHit[] };
  assert.ok(hits.results.length);
  await invoke('course_read', { chunkIds: [hits.results[0]!.chunkId] });
  assert.equal((await dispatch('course_read', { chunkIds: [hits.results[0]!.chunkId] }, 'session-b')).isError, true);
  const drafts = await projects.use('session-a', new AbortController().signal, p => groundedDrafts(p.evidence, p.projectId));
  drafts.plan.startsOn = new Date().toISOString().slice(0, 10);
  for (const [name, { courseId: _id, ...draft }] of [['course_outline_publish', drafts.outline], ['study_plan_publish', drafts.plan], ['quiz_publish', drafts.quiz]] as const) {
    const result = await invoke(name, draft); assert.deepEqual(await invoke(name, draft), result);
    assert.doesNotMatch(JSON.stringify(result), /courseId|correctOption|explanation/);
    if (name === 'study_plan_publish') {
      const receipt = await dispatch(name, draft);
      const card = toolCardModel(name, { kind: 'tool-result', callId: 'plan-card', call: null, callTime: 0,
        time: 0, seq: 1, isError: false, subCalls: [], content: receipt.content });
      assert.equal(card.title, '3 天学习计划 · 发布时 v1');
      assert.deepEqual(card.lines, drafts.plan.days.map(day => `Day ${day.day} · ${day.tasks.reduce((sum, task) => sum + task.estimatedMinutes, 0)} 分钟`));
      assert.equal(card.navigation?.section, 'plan');
    }
  }
  const dashboard = await (await http('session-a', 'dashboard')).json();
  const quizId = dashboard.quizzes[0].id;
  const quiz = await (await http('session-a', `quizzes/${quizId}`)).json();
  assert.doesNotMatch(JSON.stringify(quiz), /correctOption|explanation|courseId/);
  const answers = { submissionId: 'workspace-submit', quizId, answers: quiz.items.map((i: { id: string }, n: number) => ({ itemId: i.id, selectedOption: n < 3 ? 0 : 1 })) };
  const receipt = await (await http('session-a', 'submissions', answers)).json();
  assert.deepEqual(await (await http('session-a', 'submissions', answers)).json(), receipt);
  const state = await invoke('learning_state_get', {}) as unknown as { currentPlan: { version: number }; conceptStates: { status: string }[] };
  assert.equal(state.currentPlan.version, 2); assert.ok(state.conceptStates.some(c => c.status === 'weak'));
  assert.doesNotMatch(JSON.stringify(state), /courseId|correctOption|explanation/);
  const other = await (await http('session-b', 'dashboard')).json(); assert.equal(other.currentPlan, null);
  memberships[0]!.sessionIds = []; assert.equal((await dispatch('learning_state_get', {})).isError, true);
  assert.deepEqual(errors, []);
});
