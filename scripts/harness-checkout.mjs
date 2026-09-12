import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const releaseMetadata = new Set(['LEARNING_HELPER.md', 'UPSTREAM_BASE.md', 'UPSTREAM_PATCHES.md']);

export function resolveHarnessPath(args, fallback) {
  const paths = args[0] === '--' ? args.slice(1) : args;
  assert.ok(paths.length <= 1, 'Usage: test:integration [--] [Harness checkout]');
  return resolve(paths[0] ?? fallback);
}

/** Pin runtime source to an exact upstream commit while allowing thin-fork metadata. */
export async function verifyHarnessCheckout(path, expectedBase) {
  assert.match(expectedBase, /^[a-f0-9]{40}$/);
  const git = async args => (await exec('git', args, { cwd: path, encoding: 'utf8', timeout: 10_000, maxBuffer: 1_048_576 })).stdout;
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  await git(['merge-base', '--is-ancestor', expectedBase, head]);
  // Compare the working tree as well as committed changes; include untracked source.
  const changed = await git(['diff', '--no-ext-diff', '--name-only', '-z', expectedBase, '--']);
  const untracked = await git(['ls-files', '--others', '--exclude-standard', '-z']);
  const unexpected = (changed + untracked).split('\0').filter(path => path && !releaseMetadata.has(path));
  assert.deepEqual(unexpected, [], 'Harness runtime differs from the pinned base; only the three release metadata files may differ');
  return head;
}
