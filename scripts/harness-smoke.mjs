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
    const submit = body => fetch(`${base}/learning-helper/v2/sessions/workspace-probe-a/submissions`, {
      method: 'POST', headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
    });
    const post = (path, body) => fetch(`${base}${path}`, { method: 'POST',
      headers: { cookie, origin: base, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    return { child, base, cookie, get, post, submit, close: () => stop(child) };
  } catch (error) { await stop(child); throw error; }
}
try {
  await mkdir(join(plugin, 'artifacts'), { recursive: true }); await saveResult({ ...verification, status: 'running' });
  verification.harnessSha = await verifyHarnessCheckout(harness, expectedHarness);
  verification.pluginSha = (await run(['git', 'rev-parse', 'HEAD'], plugin)).trim();
  verification.pluginTreeDirty = Boolean((await run(['git', 'status', '--porcelain'], plugin)).trim());
  await run(['pnpm', 'run', 'build'], plugin); await run(['pnpm', 'pack', '--pack-destination', 'artifacts'], plugin);
  const version = JSON.parse(await readFile(join(plugin, 'package.json'), 'utf8')).version;
  const tarball = join(plugin, 'artifacts', `dsh-learning-helper-${version}.tgz`);
  verification.tarballSha256 = createHash('sha256').update(await readFile(tarball)).digest('hex');
  await run(['pnpm', 'dsh', '--profile', 'learning-helper', '--from-default-profile', 'web', '--dump-config']);
  const profileFile = join(env.DSH_HOME, 'profiles', 'learning-helper', 'package.json');
  const profile = JSON.parse(await readFile(profileFile, 'utf8')); profile.packageManager = 'pnpm@11.7.0';
  await writeFile(profileFile, JSON.stringify(profile, null, 2) + '\n');
  await run(['pnpm', 'dsh', 'plugin', '--profile', 'learning-helper', 'add', tarball]);
  const dump = await run(['pnpm', 'dsh', '--profile', 'learning-helper', '--dump-config']);
  assert.match(dump, /name: dsh-learning-helper/); assert.doesNotMatch(dump, /learning_helper: sqlite|learning-helper-sqlite/);
  receipts.push('prebuilt client/Host package installed; no global Learning SQLite composition');
  await writeFile(join(work, 'demo.patch.yml'), `- insert:\n    - id: learning-helper-test-probe\n      name: ${JSON.stringify(join(plugin, 'scripts/tool-probe.mjs'))}\n      config:\n        workspace: ${JSON.stringify(work)}\n`);
  const path = session => `/learning-helper/v2/sessions/${session}`;
  let before; let evidence; let browserReceipt;
  const first = await boot();
  try {
    const probe = await (await first.get('/learning-helper-test/tools')).json();
    assert.deepEqual(probe.names.sort(), ['course_original_read','course_outline_publish','course_read','course_search','learning_state_get','quiz_publish','study_plan_publish']);
    const a = 'workspace-probe-a'; const b = 'workspace-probe-b';
    for (const session of [a,b]) {
      const r = await first.post(path(session) + '/project', { title: session, subject: 'Analysis', dailyMinutes: 60 }); assert.equal(r.status, 201, await r.clone().text());
    }
    const input = { filename: 'lecture.md', mimeType: 'text/markdown', text: await readFile(join(plugin, 'demo/math-analysis/lecture-03.md'), 'utf8') };
    assert.equal((await first.post(path(a) + '/sources/text', input)).status, 201);
    assert.equal((await first.post(path(a) + '/sources/text', input)).status, 200);
    const dispatch = async (name, args, sessionId = a) => {
      const r = await first.post('/learning-helper-test/tools', { name, args, sessionId }); assert.equal(r.status, 200, await r.clone().text()); return r.json();
    };
    const result = await dispatch('course_search', { query: '一致连续' }); assert.equal(result.isError, false); assert.ok(result.value.results.length);
    const ids = result.value.results.map(r => r.chunkId);
    const read = await dispatch('course_read', { chunkIds: ids }); assert.equal(read.isError, false); evidence = read.value;
    assert.equal((await dispatch('course_read', { chunkIds: ids }, b)).isError, true);
    assert.equal((await dispatch('course_search', { query: '一致连续', courseId: 'malicious' })).isError, true);
  } finally { await first.close(); }
  const second = await boot();
  try {
    const check = await second.get('/learning-helper-test/tools'); assert.equal(check.status, 200, await check.clone().text());
    const read = await second.post('/learning-helper-test/tools', { sessionId: 'workspace-probe-a', name: 'course_read', args: { chunkIds: evidence.chunks.map(c => c.chunkId) } });
    const restored = await read.json(); assert.equal(read.status, 200, JSON.stringify(restored)); assert.equal(restored.isError, false, JSON.stringify(restored)); assert.deepEqual(restored.value, evidence);
    receipts.push('actual standard-preset Agent scope, A/B isolation, removed courseId and process restart citation persistence');
    if (process.env.LH_BROWSER_SMOKE !== '0') {
      browserReceipt = await browserSmoke({ web: second, harness, plugin, work, screenshotsPath: process.env.LH_BROWSER_SCREENSHOTS });
      before = await (await second.get(path(browserReceipt.sessionId) + '/dashboard')).json();
      assert.equal(before.currentPlan.version, 2);
      receipts.push('Chromium: workspace initialization, MD/PDF upload, grounded authoring, quiz retry, Weak/v2, task sessions, workspace switch');
    }
  } finally { await second.close(); }
  if (browserReceipt) {
    const restarted = await boot();
    try {
      const after = await (await restarted.get(path(browserReceipt.sessionId) + '/dashboard')).json();
      assert.deepEqual(after, before);
      const sources = await (await restarted.get(path(browserReceipt.sessionId) + '/sources')).json(); assert.ok(sources.sources.some(s => s.mimeType === 'application/pdf' && s.status === 'ready'));
      receipts.push('student state and PDF evidence survive final process restart');
    } finally { await restarted.close(); }
  }
  await saveResult({ ...verification, status: 'passed', receipts, workspaceRuntime: true, semanticLlmRun: false });
  console.log(receipts.join('\n'));
} catch (error) {
  await saveResult({ ...verification, status: 'failed', receipts, error: scrub(String(error)) }); throw error;
} finally { await rm(work, { recursive: true, force: true }); }
