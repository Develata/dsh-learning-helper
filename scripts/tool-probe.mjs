import { randomUUID } from 'node:crypto';

// Integration-only Host observer. Never shipped in the npm package or normal profile.
export const name = 'learning-helper-test-probe';
export const inject = ['tools', 'systemPrompt', 'webServer', 'connection', 'agents', 'agentPresets'];
export function apply(ctx) {
  const learningNames = ['course_list', 'course_search', 'course_read', 'learning_state_get', 'course_outline_publish', 'study_plan_publish', 'quiz_publish'];
  let handlePromise;
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
      send(200, { names: ctx.tools.schemas(await getAgent()).map(t => t.name).filter(n => learningNames.includes(n)),
        grounding: prompt.sections.find(s => s.name === 'learning-helper-grounding')?.text }); return;
    }
    if (req.method !== 'POST') { send(405, {}); return; }
    const expired = () => req.destroy(); signal.addEventListener('abort', expired, { once: true });
    try {
      const chunks = []; let bytes = 0;
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 16_384) throw new Error('oversize probe input'); chunks.push(chunk); }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!learningNames.includes(input.name)) throw new Error('Learning Helper tools only');
      const result = await ctx.tools.execute({ callId: 'evidence-probe', agent: await getAgent(), name: input.name, arguments: input.args, signal });
      send(200, result);
    } catch { if (!res.destroyed) send(400, {}); }
    finally { signal.removeEventListener('abort', expired); }
  } }));
}
