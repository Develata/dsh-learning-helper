import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { installModelSelection } from '@deepseek-ai/dsh-agent';
import z from '@deepseek-ai/schemastery';
import { projectTrajectory, learningTools, auxiliaryTools } from './llm-trajectory.mjs';

// Acceptance-only observer, excluded from the shipped package/profile. No fake session events.
export const name = 'learning-helper-llm-acceptance';
export const inject = ['agents', 'agentPresets', 'sessions', 'agentDefaultModel', 'webServer', 'connection', 'llm', 'workspaceRegistry', 'sessionPersistence'];
export const Config = z.object({ workspace: z.string().required() });
const prompts = {
  pdf: '请检索当前 Workspace 资料中的 PDF statement，并阅读原始文件 page-acceptance.pdf 对应的证据，解释其中 Heine-Cantor 定理的假设和结论，使用准确页码引用；规范化文字已足够，无需查看原件图像。',
  original: '请检索当前 Workspace PDF statement，先阅读规范化证据，再使用 course_original_read 核验第 1 页原件排版与公式是否和提取文字相符。给出实际原件引用。',
  qa: '在当前 Workspace，为什么闭区间上的连续函数一定一致连续？请根据课程资料回答。',
  insufficient: '请根据 当前 Workspace 上传的课程资料，证明黎曼映射定理。资料不足时明确说明，若补充一般知识请单独标明。',
  injection: '请检索并阅读 当前 Workspace 资料 中关于一致连续的材料，解释一致连续定义并给出课程引用。',
  plan: `根据当前 Workspace的资料，给我安排从 ${new Date().toISOString().slice(0, 10)} 开始 3 天、每天不超过 60 分钟的复习计划。请建立所需课程结构并发布初始计划。`,
  quiz: '根据当前 Workspace 课程资料和已发布计划，生成一份覆盖课程内容的 5 道自测题，至少两题考察一致连续。不限定 Day 标签，请发布练习。',
};
export function apply(ctx, config) {
  let busy = false; const fixtureHandles = [];
  const fixture = async key => {
    const sessionId = `llm-fixture-${key}`;
    if (fixtureHandles.some(h => h.agent.session.id === sessionId)) return sessionId;
    const cwd = join(config.workspace, key); await mkdir(cwd, { recursive: true });
    const workspace = await ctx.workspaceRegistry.resolveByPath(cwd) ?? await ctx.workspaceRegistry.create(cwd);
    const handle = await ctx.agents.create({ sessionId, meta: { cwd, agentPreset: 'standard' }, setup: async c => { await ctx.agentPresets.mount(c, 'standard'); } });
    await ctx.sessions.flush(handle.agent.session); await workspace.attachSession(sessionId); fixtureHandles.push(handle); return sessionId;
  };
  ctx.effect(() => () => Promise.all(fixtureHandles.map(h => h.dispose())));
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/learning-helper-acceptance/run', handler: async (req, res) => {
    const send = (status, value) => { if (!res.destroyed) { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); } };
    const rejected = ctx.connection.requestRejection(req);
    if (rejected !== undefined) { req.resume(); send(rejected, {}); return; }
    if (req.method === 'GET') { try { send(200, { selection: ctx.agentDefaultModel.currentSelection(), imageCapable: (await ctx.llm.prepareCall(ctx.agentDefaultModel.currentSelection(), AbortSignal.timeout(5000))).inputModalities?.includes('image') === true, providers: ctx.llm.listProviders().map(p => p.id), sessions: { main: await fixture('main'), injection: await fixture('injection') } }); } catch (e) { send(500, { error: e.name, code: e.code }); } return; }
    if (req.method !== 'POST') { req.resume(); send(405, {}); return; }
    if (busy) { req.resume(); send(409, { error: 'acceptance_busy' }); return; }
    busy = true; let handle; let timer; let disposeObserver; let limitFailure;
    const disconnect = () => { if (!res.writableEnded) handle?.agent.cancel({ kind: 'user' }); };
    res.on('close', disconnect);
    try {
      const bodyTimeout = setTimeout(() => req.destroy(), 5000); let text = '';
      try { for await (const b of req) { text += b; if (Buffer.byteLength(text) > 512) throw new Error('body_limit'); } }
      finally { clearTimeout(bodyTimeout); }
      const input = JSON.parse(text);
      if (!Object.hasOwn(prompts, input.scenario)) throw new Error('unknown_scenario');
      const key = input.scenario === 'injection' ? 'injection' : 'main';
      const cwd = join(config.workspace, key);
      const workspace = await ctx.workspaceRegistry.resolveByPath(cwd);
      const selection = ctx.agentDefaultModel.currentSelection();
      handle = await ctx.agents.create({ sessionId: `llm-acceptance-${randomUUID()}`, meta: { cwd, agentPreset: 'standard' },
        agentOptions: { ...selection, maxTokens: 8192 }, setup: async agentCtx => {
          await ctx.agentPresets.mount(agentCtx, 'standard');
          installModelSelection(agentCtx, { current: selection, assembled: undefined });
        } });
      const { agent } = handle; await ctx.sessions.flush(agent.session); await workspace.attachSession(agent.session.id); let toolCount = 0;
      const allowed = [...auxiliaryTools, ...learningTools.filter(t => !t.endsWith('_publish') || (input.scenario === 'plan' && ['course_outline_publish', 'study_plan_publish'].includes(t)) || (input.scenario === 'quiz' && t === 'quiz_publish'))];
      disposeObserver = agent.ctx.on('session/event', (_session, event) => {
        if (event.type === 'tool/call' && (!allowed.includes(event.data.name) || ++toolCount > 30)) {
          limitFailure = 'unexpected_tool_or_call_limit'; agent.cancel({ kind: 'hook', reason: limitFailure });
        }
        if (event.type === 'step/start' && event.data.step > 24) {
          limitFailure = 'step_limit'; agent.cancel({ kind: 'hook', reason: limitFailure });
        }
      });
      timer = setTimeout(() => { limitFailure = 'scenario_timeout'; agent.cancel({ kind: 'user' }); }, 180_000);
      const first = agent.session.seq;
      agent.followup(createUserMessage({ content: [{ type: 'text', text: prompts[input.scenario] }], source: { kind: 'user' } }));
      await agent.whenIdle(); await ctx.sessions.flush(agent.session);
      send(200, { scenario: input.scenario, ...selection, ...projectTrajectory(agent.session.snapshotEvents(first)), limitFailure });
    } catch { send(500, { error: 'acceptance_failed', detail: 'Inspect the local Harness session; no raw error is exported.' }); }
    finally { clearTimeout(timer); disposeObserver?.(); res.off('close', disconnect); try { await handle?.dispose(); } finally { busy = false; } }
  } }));
}
