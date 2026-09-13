import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { resolveHarnessPath, verifyHarnessCheckout } from '../scripts/harness-checkout.mjs';

async function checkout(t) {
  // Disposable Git fixture; no real Harness checkout or sibling dependency is used.
  const path = await mkdtemp(join(tmpdir(), 'learning-checkout-'));
  t.after(() => rm(path, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Learning Test', '-c', 'user.email=test@example.invalid',
    '-c', 'commit.gpgsign=false', ...args], { cwd: path, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init');
  await mkdir(join(path, 'packages'));
  await writeFile(join(path, 'packages', 'runtime.js'), 'export const version = 1;\n');
  git('add', '.'); git('commit', '-m', 'test runtime');
  return { path, git, base: git('rev-parse', 'HEAD') };
}

test('integration CLI accepts pnpm separator, direct path and default path', () => {
  const fallback = '/tmp/default-harness';
  assert.equal(resolveHarnessPath(['--', '/tmp/harness'], fallback), '/tmp/harness');
  assert.equal(resolveHarnessPath(['/tmp/harness'], fallback), '/tmp/harness');
  assert.equal(resolveHarnessPath([], fallback), resolve(fallback));
  assert.equal(resolveHarnessPath(['--'], fallback), resolve(fallback));
  assert.throws(() => resolveHarnessPath(['first', 'second'], fallback), /Usage/);
});

test('pinned runtime accepts a descendant containing only release metadata', async t => {
  const { path, git, base } = await checkout(t);
  assert.equal(await verifyHarnessCheckout(path, base), base);
  await writeFile(join(path, 'UPSTREAM_BASE.md'), `Runtime: ${base}\n`);
  git('add', '.'); git('commit', '-m', 'test release metadata');
  const head = git('rev-parse', 'HEAD'); assert.notEqual(head, base);
  assert.equal(await verifyHarnessCheckout(path, base), head);
  await mkdir(join(path, 'deploy/learning-helper'), { recursive: true });
  await writeFile(join(path, 'deploy/learning-helper/Dockerfile'), 'FROM pinned-image\n');
  assert.equal(await verifyHarnessCheckout(path, base), head);
  await mkdir(join(path, 'deploy/unrelated'), { recursive: true });
  await writeFile(join(path, 'deploy/unrelated/runtime.js'), 'unexpected\n');
  await assert.rejects(verifyHarnessCheckout(path, base), /runtime differs/);
});

for (const mode of ['committed', 'staged', 'unstaged', 'untracked']) test(`runtime guard rejects ${mode} source changes`, async t => {
  const { path, git, base } = await checkout(t);
  await writeFile(join(path, 'packages', mode === 'untracked' ? 'new.js' : 'runtime.js'), 'export const version = 2;\n');
  if (mode === 'staged' || mode === 'committed') git('add', '.');
  if (mode === 'committed') git('commit', '-m', 'test runtime drift');
  await assert.rejects(verifyHarnessCheckout(path, base), /runtime differs/);
});

test('branding exception stays limited to the reviewed presentation files', async t => {
  const { path, base } = await checkout(t);
  await mkdir(join(path, 'apps/web/public'), { recursive: true });
  await writeFile(join(path, 'apps/web/public/favicon.svg'), '<svg/>');
  assert.equal(await verifyHarnessCheckout(path, base), base);
  await mkdir(join(path, 'packages/client/ui-conversation/src/client'), { recursive: true });
  await writeFile(join(path, 'packages/client/ui-conversation/src/client/index.ts'), 'unexpected implementation change');
  await assert.rejects(verifyHarnessCheckout(path, base), /runtime differs/);
});
