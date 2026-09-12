import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createHash } from 'node:crypto';
import { resolveHarnessPath, verifyHarnessCheckout } from './harness-checkout.mjs';

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
    return { child, get, submit, close: () => stop(child) };
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
  await writeFile(join(work, 'demo.patch.yml'), '- id: learning-helper\n  config:\n    demo: true\n');
  const body = { submissionId: 'smoke-submit', quizId: 'day-1', answers: [0, 1, 2, 1, 0].map((selectedOption, i) => ({ itemId: `q${i + 1}`, selectedOption })) };
  let first;
  const web = await boot();
  try {
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
    const replay = await reopened.submit(body); assert.equal(replay.status, 200); assert.deepEqual(await replay.json(), first);
    const state = await (await reopened.get('/learning-helper/v1/courses/demo-calculus/state')).json();
    assert.equal(state.plan.version, 2); assert.equal(state.revisions.length, 1);
    receipts.push('new Harness process recovers SQLite state and idempotent submission receipt');
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
