import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { resolveHarnessPath, verifyHarnessCheckout } from './harness-checkout.mjs';
import { browserSmoke } from './browser-smoke.mjs';

const plugin = resolve(import.meta.dirname, '..');
const harness = resolveHarnessPath(process.argv.slice(2), join(plugin, '..', 'learning-helper'));
const expectedHarness = 'c291e7961a515f6d7af9304e7fd1d257929aef26';
const work = await mkdtemp(join(tmpdir(), 'learning-helper-smoke-'));
const env = { ...process.env, DSH_HOME: join(work, 'home') };
const scrub = s => s.replace(/([?&]token=)[^\s"'<>]+/g, '$1[REDACTED]');
const appendLog = (log, chunk) => (log + chunk).slice(-1_048_576);
const receipts = [];
const resultFile = join(plugin, 'artifacts', 'integration-result.json');
const verification = { startedAt: new Date().toISOString(), harnessBaseSha: expectedHarness };
const saveResult = result => writeFile(resultFile, JSON.stringify(result, null, 2) + '\n');
async function stop(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
  const exited = once(child, 'exit');
  try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
  const killTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }, 5000);
  try { await exited; } finally { clearTimeout(killTimer); }
}
async function run(args, cwd = harness, timeout = 120_000) {
  const child = spawn(args[0], args.slice(1), { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; let expired = false;
  child.stdout.on('data', x => { output = appendLog(output, x); }); child.stderr.on('data', x => { output = appendLog(output, x); });
  const timer = setTimeout(() => { expired = true; void stop(child); }, timeout);
  try {
    const [code] = await once(child, 'exit');
    assert.equal(code, 0, `${args.join(' ')}: ${expired ? 'timeout' : ''}\n${scrub(output).slice(-5000)}`);
    return output;
  } finally { clearTimeout(timer); }
}
async function boot() {
  const child = spawn('pnpm', ['dsh', '--profile', 'learning-helper', '--patch', join(work, 'demo.patch.yml'), '--no-open', '--port', '0'],
    { cwd: harness, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; child.stdout.on('data', x => { log = appendLog(log, x); }); child.stderr.on('data', x => { log = appendLog(log, x); });
  child.on('error', e => { log = appendLog(log, String(e)); });
  try {
    const deadline = Date.now() + 45_000;
    let entry;
    while (Date.now() < deadline) {
      entry = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];
      if (entry) break;
      if (child.exitCode !== null || child.signalCode !== null) throw new Error(scrub(log).slice(-5000));
      await delay(100);
    }
    assert.ok(entry, `Web startup deadline exceeded: ${scrub(log).slice(-3000)}`);
    const base = new URL(entry).origin;
    const health = `${base}/learning-helper/v1/health`;
    assert.equal((await fetch(health, { signal: AbortSignal.timeout(5000) })).status, 401);
    const exchange = await fetch(entry, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
    assert.equal(exchange.status, 303);
    const cookie = exchange.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
    const get = path => fetch(`${base}${path}`, { headers: { cookie }, signal: AbortSignal.timeout(5000) });
    assert.equal((await get('/learning-helper/v1/health')).status, 200);
    const htmlResponse = await get('/'); assert.equal(htmlResponse.status, 200);
    const html = await htmlResponse.text(); assert.match(html, /__DSH_BOOT__/);
    const assets = [...html.matchAll(/(?:src|href)="([^"]+(?:\.js|\.css|\/plugins\/\?\?)[^"]*)"/g)].map(m => m[1].replaceAll('&amp;', '&'));
    assert.ok(assets.length > 0);
    for (const asset of assets) assert.equal((await fetch(new URL(asset, base), { signal: AbortSignal.timeout(10_000) })).status, 200, `asset: ${asset}`);
    const denied = await fetch(health, { headers: { cookie, origin: 'https://foreign.example' }, signal: AbortSignal.timeout(5000) });
    assert.equal(denied.status, 403);
    const submit = body => fetch(`${base}/learning-helper/v1/courses/demo-calculus/submissions`, {
      method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const post = (path, body) => fetch(`${base}${path}`, { method: 'POST',
      headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    return { child, base, cookie, get, post, submit, close: () => stop(child) };
  } catch (error) { await stop(child); throw error; }
}

try {
  await mkdir(join(plugin, 'artifacts'), { recursive: true });
  await saveResult({ ...verification, status: 'running' });
  verification.harnessSha = await verifyHarnessCheckout(harness, expectedHarness);
  verification.pluginSha = (await run(['git', 'rev-parse', 'HEAD'], plugin)).trim();
  verification.pluginTreeDirty = Boolean((await run(['git', 'status', '--porcelain'], plugin)).trim());
  await run(['pnpm', 'run', 'build'], plugin);
  await run(['pnpm', 'pack', '--pack-destination', 'artifacts'], plugin);
  const tarball = join(plugin, 'artifacts', 'dsh-learning-helper-0.1.0.tgz');
  verification.tarballSha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
  await run(['pnpm', 'dsh', '--profile', 'learning-helper', '--from-default-profile', 'web', '--dump-config']);
  // Let dsh own composition; pin only the package-manager version in its generated profile.
  const profileFile = join(env.DSH_HOME, 'profiles', 'learning-helper', 'package.json');
  const profile = JSON.parse(await readFile(profileFile, 'utf8')); profile.packageManager = 'pnpm@11.7.0';
  await writeFile(profileFile, JSON.stringify(profile, null, 2) + '\n');
  await run(['pnpm', 'dsh', 'plugin', '--profile', 'learning-helper', 'add', tarball]);
  receipts.push('prebuilt tarball installed through dsh plugin with pnpm 11.7.0');
  const dump = await run(['pnpm', 'dsh', '--profile', 'learning-helper', '--dump-config']);
  assert.match(dump, /learning_helper: sqlite/); assert.match(dump, /name: dsh-learning-helper/);
  receipts.push('bundle composition routes learning_helper to SQLite');
  await writeFile(join(work, 'demo.patch.yml'), `- id: learning-helper
  config:
    demo: true
    evidencePath: !!js dshHomePath('learning-helper', 'evidence.db')
- insert:
    - id: learning-helper-test-probe
      name: ${JSON.stringify(join(plugin, 'scripts', 'tool-probe.mjs'))}
`);
  const body = { submissionId: 'smoke-submit', quizId: 'day-1', answers: [0, 1, 2, 1, 0].map((selectedOption, i) => ({ itemId: `q${i + 1}`, selectedOption })) };
  let first; let citationRead; let authored;
  const web = await boot();
  try {
    if (process.env.LH_BROWSER_SMOKE !== '0') { await browserSmoke({ web, harness, plugin, work }); receipts.push('real browser: native Learning panel and student learning loop'); }
    const course = await web.post('/learning-helper/v1/courses', { id: 'evidence-smoke', title: '数学分析', subject: 'calculus', dailyMinutes: 60 });
    assert.equal(course.status, 201);
    assert.equal((await (await web.get('/learning-helper/v1/courses/evidence-smoke/state')).json()).plan, null);
    const material = { filename: 'Lecture 03.md', mimeType: 'text/markdown', text: await readFile(join(plugin, 'demo/math-analysis/lecture-03.md'), 'utf8') };
    const imported = await web.post('/learning-helper/v1/courses/evidence-smoke/sources/text', material); assert.equal(imported.status, 201, await imported.clone().text());
    assert.equal((await web.post('/learning-helper/v1/courses/evidence-smoke/sources/text', material)).status, 200);
    const probe = await (await web.get('/learning-helper-test/tools')).json();
    assert.deepEqual(probe.names.sort(), ['course_list', 'course_outline_publish', 'course_read', 'course_search', 'learning_state_get', 'quiz_publish', 'study_plan_publish']); assert.match(probe.grounding, /UNTRUSTED EVIDENCE DATA/);
    const dispatch = async (name, args) => { const res = await web.post('/learning-helper-test/tools', { name, args }); assert.equal(res.status, 200); const result = await res.json(); assert.ok(!result.isError, JSON.stringify(result)); return result.value; };
    const listed = await dispatch('course_list', {}); assert.ok(listed.courses.some(c => c.id === 'evidence-smoke'));
    const found = await dispatch('course_search', { courseId: 'evidence-smoke', query: 'Heine Cantor' }); assert.ok(found.results.length > 0);
    citationRead = await dispatch('course_read', { courseId: 'evidence-smoke', chunkIds: found.results.map(r => r.chunkId) });
    assert.match(citationRead.chunks[0].text, /闭区间/); assert.match(citationRead.chunks[0].canonicalRef, /^learning-evidence:\/\/evidence-smoke\//);
    assert.equal(citationRead.chunks[0].locator.kind, 'text'); assert.ok(!('page' in citationRead.chunks[0].locator));
    receipts.push('empty course → Markdown import/dedupe → standard-preset DSH Agent tool dispatch list/search/read → stable line citation; Agent-scoped grounding section assembled');
    const courseId = 'evidence-smoke';
    const continuityHits = await dispatch('course_search', { courseId, query: 'Continuity 连续性' });
    const uniformHits = await dispatch('course_search', { courseId, query: '一致连续' });
    const continuityIds = continuityHits.results.map(r => r.chunkId); const uniformIds = uniformHits.results.map(r => r.chunkId);
    await dispatch('course_read', { courseId, chunkIds: [...new Set([...continuityIds, ...uniformIds])] });
    const outlineDraft = { courseId, concepts: [
      { id: 'continuity', name: 'Continuity', aliases: ['连续性'], prerequisiteIds: [], evidenceChunkIds: continuityIds },
      { id: 'uniform-continuity', name: 'Uniform Continuity', aliases: ['一致连续'], prerequisiteIds: ['continuity'], evidenceChunkIds: uniformIds },
    ] };
    const planDraft = { courseId, startsOn: new Date().toISOString().slice(0, 10), days: [1, 2, 3].map(day => ({ day,
      tasks: [{ type: 'learn', conceptIds: [day === 1 ? 'continuity' : 'uniform-continuity'], estimatedMinutes: 40, reason: '学习课程定义及证明。' },
        { type: 'practice', conceptIds: ['continuity', 'uniform-continuity'], estimatedMinutes: 20, questionCount: 5, reason: '检查课程概念理解。' }] })) };
    const questions = [
      ['连续性要求哪个极限等于 f(a)？', ['x 趋于 a 时的 f(x)', '与 a 无关的极限'], '连续性定义要求 lim f(x)=f(a)。'],
      ['f 在 a 连续且 x_n 趋于 a，f(x_n) 是否趋于 f(a)？', ['是', '否'], '这是连续性的序列刻画。'],
      ['连续性定义是否涉及函数在该点的值？', ['是', '否'], '极限等于 f(a)，所以涉及该点函数值。'],
      ['一致连续的 δ 能否依赖所选的点？', ['不能', '可以'], 'δ 必须统一适用于定义域内所有点。'],
      ['Heine-Cantor 的假设是什么？', ['闭区间上连续', '仅在开区间上连续'], '闭区间上连续则一致连续，讲义有开区间反例。'],
    ];
    const quizDraft = { courseId, purpose: 'Day 1 grounded quiz', items: questions.map(([prompt, options, explanation], i) => ({
      prompt, options, explanation, correctOption: 0, difficulty: 'medium', conceptIds: [i < 3 ? 'continuity' : 'uniform-continuity'], evidenceChunkIds: i < 3 ? continuityIds : uniformIds,
    })) };
    const outline = await dispatch('course_outline_publish', outlineDraft);
    const initial = await dispatch('study_plan_publish', planDraft);
    const published = await dispatch('quiz_publish', quizDraft);
    assert.equal(initial.plan.version, 1); assert.equal(published.quiz.items.length, 5);
    assert.doesNotMatch(JSON.stringify(published), /correctOption|explanation/);
    const publicResponse = await web.get(`/learning-helper/v1/courses/${courseId}/quizzes/${published.quiz.id}`);
    assert.equal(publicResponse.status, 200); assert.deepEqual(await publicResponse.json(), published.quiz);
    const submission = { submissionId: 'authored-student', quizId: published.quiz.id,
      answers: published.quiz.items.map((i, n) => ({ itemId: i.id, selectedOption: n < 3 ? 0 : 1 })) };
    const submitted = await web.post(`/learning-helper/v1/courses/${courseId}/submissions`, submission);
    assert.equal(submitted.status, 200); const receipt = await submitted.json();
    const context = await dispatch('learning_state_get', { courseId });
    assert.equal(receipt.attempts.length, 5); assert.equal(context.currentPlan.version, 2);
    assert.equal(context.conceptStates.find(c => c.conceptId === 'uniform-continuity').status, 'weak');
    assert.equal(context.reviewQueue[0].conceptId, 'uniform-continuity');
    assert.deepEqual(context.recentPlanRevision.evidenceAttemptIds, receipt.attempts.slice(3).map(a => a.id));
    assert.equal(context.currentPlan.days[1].tasks[0].estimatedMinutes, 20);
    assert.equal(context.currentPlan.days[1].tasks[1].questionCount, 3);
    assert.doesNotMatch(JSON.stringify(context), /correctOption|explanation|selectedAnswer/);
    authored = { courseId, outlineDraft, planDraft, quizDraft, outline, initial, published, submission, receipt, context };
    receipts.push('packed standard Agent dispatches grounded outline/initial plan/quiz/state; public quiz hides key; student HTTP submit makes weak/review/v2 with 20-minute review + 3 questions');
    const quiz = await web.get('/learning-helper/v1/courses/demo-calculus/quizzes/day-1');
    assert.equal(quiz.status, 200); assert.doesNotMatch(await quiz.text(), /correctOption|explanation/);
    const response = await web.submit(body); assert.equal(response.status, 200); first = await response.json();
    assert.equal(first.receipt.revision.newVersion, 2); assert.equal(first.attempts.length, 5);
    const state = await (await web.get('/learning-helper/v1/courses/demo-calculus/state')).json();
    assert.equal(state.conceptStates[3].status, 'weak'); assert.equal(state.reviewQueue.length, 1);
    assert.equal(state.plan.days[1].tasks.find(t => t.type === 'review').estimatedMinutes, 20);
    assert.equal(state.plan.days[1].tasks.find(t => t.type === 'practice').questionCount, 3);
    receipts.push('authenticated Web shell/assets and Host quiz submission pass; unauthenticated/cross-origin requests rejected');
  } finally { await web.close(); }
  const reopened = await boot();
  try {
    const evidenceRead = await reopened.post('/learning-helper-test/tools', { name: 'course_read', args: { courseId: 'evidence-smoke', chunkIds: citationRead.chunks.map(c => c.chunkId) } });
    const result = await evidenceRead.json(); assert.ok(!result.isError); assert.deepEqual(result.value, citationRead);
    const sourceList = await (await reopened.get('/learning-helper/v1/courses/evidence-smoke/sources')).json(); assert.equal(sourceList.sources.length, 1);
    receipts.push('new Harness process reopens independent evidence.db with identical chunk text, locator and canonical citation');
    const replay = await reopened.submit(body); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), first);
    const state = await (await reopened.get('/learning-helper/v1/courses/demo-calculus/state')).json();
    assert.equal(state.plan.version, 2); assert.equal(state.revisions.length, 1);
    receipts.push('new Harness process recovers SQLite state and idempotent submission receipt');
    const dispatch = async (name, args) => { const res = await reopened.post('/learning-helper-test/tools', { name, args });
      assert.equal(res.status, 200); const result = await res.json(); assert.ok(!result.isError, JSON.stringify(result)); return result.value; };
    assert.deepEqual(await dispatch('learning_state_get', { courseId: authored.courseId }), authored.context);
    assert.deepEqual(await dispatch('course_outline_publish', authored.outlineDraft), authored.outline);
    assert.deepEqual(await dispatch('study_plan_publish', authored.planDraft), authored.initial);
    assert.deepEqual(await dispatch('quiz_publish', authored.quizDraft), authored.published);
    const retry = await reopened.post(`/learning-helper/v1/courses/${authored.courseId}/submissions`, authored.submission);
    assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), authored.receipt);
    assert.deepEqual(await dispatch('learning_state_get', { courseId: authored.courseId }), authored.context);
    receipts.push('new Harness process restores authored outline/quiz/adaptive v2; publish retries retain original v1 and quiz identity without resetting weak state or duplicating attempts');

  } finally { await reopened.close(); }
  const result = { ...verification, status: 'passed', verifiedAt: new Date().toISOString(), node: process.version,
    profilePnpm: '11.7.0', temporaryState: 'removed after verification', receipts };
  await saveResult(result);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  const message = scrub(error.stack ?? String(error));
  await saveResult({ ...verification, status: 'failed', error: message });
  console.error(message); process.exitCode = 1;
}
finally { await rm(work, { recursive: true, force: true }); }
