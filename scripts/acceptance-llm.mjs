import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir, homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { resolveHarnessPath, verifyHarnessCheckout } from './harness-checkout.mjs';

const plugin = resolve(import.meta.dirname, '..');
const harness = resolveHarnessPath(process.argv.slice(2), join(plugin, '..', 'learning-helper'));
const userHome = process.env.DSH_HOME ?? join(homedir(), '.dsh');
const work = await mkdtemp(join(tmpdir(), 'learning-helper-llm-'));
const env = { ...process.env, DSH_HOME: join(work, 'home') };
const output = join(plugin, 'artifacts/llm-acceptance.json');
const result = { date: new Date().toISOString(), status: 'running', scenarios: [], semanticReview: 'pending' };
const scrub = s => s.replace(/([?&]token=)[^\s"'<>]+/g, '$1[REDACTED]').replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
async function stop(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  const ended = once(child, 'exit');
  try { process.kill(-child.pid, 'SIGTERM'); } catch (e) { if (e.code !== 'ESRCH') throw e; }
  const kill = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch (e) { if (e.code !== 'ESRCH') throw e; } }, 5000);
  try { await ended; } finally { clearTimeout(kill); }
}
function start(args) {
  const child = spawn(args[0], args.slice(1), { cwd: harness, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; for (const stream of [child.stdout, child.stderr]) stream.on('data', b => { log = (log + b).slice(-1_048_576); });
  return { child, log: () => log };
}
async function run(args, cwd = harness) {
  const child = spawn(args[0], args.slice(1), { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = ''; let timedOut = false;
  for (const s of [child.stdout, child.stderr]) s.on('data', b => { log = (log + b).slice(-1_048_576); });
  const timer = setTimeout(() => { timedOut = true; void stop(child); }, 120_000);
  try { const [code] = await once(child, 'exit'); assert.ok(!timedOut && code === 0, scrub(log).slice(-1500)); return log; }
  finally { clearTimeout(timer); }
}
let web;
try {
  await mkdir(join(plugin, 'artifacts'), { recursive: true });
  result.harnessSha = await verifyHarnessCheckout(harness, 'c291e7961a515f6d7af9304e7fd1d257929aef26');
  result.pluginSha = (await run(['git', 'rev-parse', 'HEAD'], plugin)).trim();
  result.pluginTreeDirty = Boolean((await run(['git', 'status', '--porcelain'], plugin)).trim());
  await run(['pnpm', 'run', 'build'], plugin); await run(['pnpm', 'pack', '--pack-destination', 'artifacts'], plugin);
  const tarball = join(plugin, 'artifacts/dsh-learning-helper-0.1.0.tgz');
  result.tarballSha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
  await run(['pnpm', 'dsh', '--profile', 'learning-helper', '--from-default-profile', 'web', '--dump-config']);
  const profilePath = join(env.DSH_HOME, 'profiles/learning-helper/package.json');
  const profile = JSON.parse(await readFile(profilePath, 'utf8')); profile.packageManager = 'pnpm@11.7.0';
  await writeFile(profilePath, JSON.stringify(profile, null, 2) + '\n');
  await run(['pnpm', 'dsh', 'plugin', '--profile', 'learning-helper', 'add', tarball]);
  // Official provider configuration points at the user's files; no secret copy or environment export.
  const patch = join(work, 'acceptance.patch.yml');
  const workspace = join(work, 'student-workspace'); await mkdir(workspace);
  await writeFile(patch, `- id: settings\n  config:\n    path: ${JSON.stringify(join(userHome, 'settings.yaml'))}\n- id: credentials\n  config:\n    path: ${JSON.stringify(join(userHome, '.credentials.yaml'))}\n- insert:\n    - id: learning-helper-llm-acceptance\n      name: ${JSON.stringify(join(plugin, 'scripts/llm-probe.mjs'))}\n      config:\n        workspace: ${JSON.stringify(workspace)}\n`);
  web = start(['pnpm', 'dsh', '--profile', 'learning-helper', '--patch', patch, '--no-open', '--port', '0']);
  const deadline = Date.now() + 45_000; let entry;
  while (Date.now() < deadline) {
    entry = web.log().match(/http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+/)?.[0];
    if (entry) break;
    assert.ok(web.child.exitCode === null, scrub(web.log()).slice(-1800)); await delay(150);
  }
  assert.ok(entry, 'Harness startup timeout'); const base = new URL(entry).origin;
  const auth = await fetch(entry, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
  const cookie = auth.headers.get('set-cookie')?.split(';')[0]; assert.ok(cookie);
  async function request(path, body, ms = 10_000) {
    const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { cookie, origin: base, 'content-type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(ms) });
    assert.ok(r.ok, `Acceptance Host status ${r.status}`); return r.json();
  }
  const roster = await request('/learning-helper-acceptance/run');
  result.provider = roster.selection.provider; result.model = roster.selection.model;
  assert.ok(roster.providers.includes(result.provider), 'Selected provider is not registered');
  console.log(`Actual Harness Agent: ${result.provider}/${result.model}`);
  for (const [id, filename] of [['llm-course', 'lecture-03.md'], ['llm-injection', 'injection.txt']]) {
    await request('/learning-helper/v1/courses', { id, title: id === 'llm-course' ? '数学分析验收课程' : '注入防御验收课程', subject: '数学分析', dailyMinutes: 60 });
    await request(`/learning-helper/v1/courses/${id}/sources/text`, { filename, mimeType: filename.endsWith('.md') ? 'text/markdown' : 'text/plain', text: await readFile(join(plugin, 'demo/math-analysis', filename), 'utf8') });
  }
  for (const scenario of ['qa', 'insufficient', 'injection', 'plan', 'quiz']) {
    console.log(`Running real scenario: ${scenario}`);
    const r = await request('/learning-helper-acceptance/run', { scenario }, 195_000);
    const needed = scenario === 'plan' ? ['course_outline_publish', 'study_plan_publish'] : scenario === 'quiz' ? ['quiz_publish'] : [];
    r.deterministicPass = !r.limitFailure && r.checks.completed && r.checks.onlyExpectedTools && r.checks.searchUsed && r.checks.citationsValid && r.checks.readBeforePublish
      && (scenario === 'insufficient' || r.checks.readUsed) && needed.every(t => r.tools.includes(t))
      && (!['qa', 'injection'].includes(scenario) || r.checks.groundedCitation);
    result.scenarios.push(r); await writeFile(output, scrub(JSON.stringify(result, null, 2)) + '\n', { mode: 0o600 });
    console.log(`${scenario}: deterministic ${r.deterministicPass ? 'PASS' : 'FAIL'}; tools: ${r.tools.join(', ')}`);
  }
  result.dashboard = await request('/learning-helper/v1/courses/llm-course/dashboard');
  result.status = result.scenarios.every(s => s.deterministicPass) ? 'semantic_review_required' : 'failed';
} catch (error) {
  // Missing credentials are identified by actual Harness failures, never presented as an accepted run.
  result.status = 'blocked_or_failed'; result.error = scrub(String(error)).slice(0, 2000); process.exitCode = 1;
} finally {
  await stop(web?.child);
  await writeFile(output, scrub(JSON.stringify(result, null, 2)) + '\n', { mode: 0o600 });
  await rm(work, { recursive: true, force: true }); // Only this runner's fresh private fixture directory.
}
console.log(`LLM gate: ${result.status}; sanitized artifact: artifacts/llm-acceptance.json`);
if (result.status !== 'semantic_review_required') process.exitCode = 1;
