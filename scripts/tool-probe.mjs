import { randomUUID } from 'node:crypto';
import { createUserMessage, createAssistantMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';

// Integration-only Host observer. Never shipped in the npm package or normal profile.
export const name = 'learning-helper-test-probe';
export const inject = ['tools', 'systemPrompt', 'webServer', 'connection', 'agents', 'agentPresets', 'sessions'];
export function apply(ctx) {
  const learningNames = ['course_list', 'course_search', 'course_read', 'learning_state_get', 'course_outline_publish', 'study_plan_publish', 'quiz_publish'];
  let handlePromise;
  const turns = new Map();
  const getAgent = async () => {
    handlePromise ??= ctx.agents.create({ sessionId: `evidence-probe-${randomUUID()}`,
      meta: { cwd: process.cwd(), agentPreset: 'standard' },
      setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, 'standard'); } });
    return (await handlePromise).agent;
  };
  ctx.effect(() => async () => { if (handlePromise) await (await handlePromise).dispose(); });
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/learning-helper-test/tools', handler: async (req, res) => {
    const send = (status, value) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(value)); };
    const rejection = ctx.connection.requestRejection(req);
    if (rejection !== undefined) { req.resume(); send(rejection, {}); return; }
    const signal = AbortSignal.timeout(5000);
    if (req.method === 'GET') {
      const prompt = await ctx.systemPrompt.assemble({ scope: await getAgent() });
      send(200, { sessions: ctx.agents.list().map(a => ({ id: a.session.id, cwd: a.session.header.cwd })), names: ctx.tools.schemas(await getAgent()).map(t => t.name).filter(n => learningNames.includes(n)),
        grounding: prompt.sections.find(s => s.name === 'learning-helper-grounding')?.text }); return;
    }
    if (req.method !== 'POST') { send(405, {}); return; }
    const expired = () => req.destroy(); signal.addEventListener('abort', expired, { once: true });
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 16_384) throw new Error('oversize probe input'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!learningNames.includes(input.name)) throw new Error('Learning Helper tools only');
      const agent = input.sessionId ? ctx.agents.get(input.sessionId) : await getAgent();
      if (!agent) throw new Error('Test session not found');
      const callId = `probe-${randomUUID()}`;
      const turn = (turns.get(agent.session.id) ?? 0) + 1;
      if (input.record) {
        turns.set(agent.session.id, turn);
        agent.session.append('turn/start', { turn });
        agent.session.append('user/message', createUserMessage({ content: [{ type: 'text', text: '确定性浏览器验收：' + input.name }], source: { kind: 'user' } }), { surfaceOp: 'append' });
        agent.session.append('step/start', { turn, step: 1 });
        agent.session.append('tool/call', { turn, step: 1, callId, name: input.name, arguments: JSON.stringify(input.args) });
      }
      const result = await ctx.tools.execute({ callId, agent, name: input.name, arguments: input.args, signal });
      if (input.record) {
        agent.session.append('tool/result', { turn, step: 1, message: createToolResultMessage({ callId, content: result.content, isError: !!result.isError }) }, { surfaceOp: 'append' });
        agent.session.append('assistant/message', { turn, step: 1, stream: [], message: createAssistantMessage({ content: [{ type: 'text', text: '学习内容已处理，请在学习面板查看。' }], source: { provider: 'deterministic-fixture', model: 'no-llm' } }) }, { surfaceOp: 'append' });
        agent.session.append('step/end', { turn, step: 1 });
        agent.session.append('turn/end', { turn, reason: { kind: 'completed' } });
        await ctx.sessions.flush(agent.session);
      }
      send(200, result);
    } catch (error) { if (!res.destroyed) send(400, { error: String(error).slice(0, 1000) }); }
    finally { signal.removeEventListener('abort', expired); }
  } }));
}
