import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const releaseMetadata = new Set(['LEARNING_HELPER.md', 'UPSTREAM_BASE.md', 'UPSTREAM_PATCHES.md', '.github/workflows/learning-helper-release.yml']);
// User-authorized presentation-only fork patches; no broad packages/apps exemption.
const brandingFiles = new Set([
  'apps/web/index.html', 'apps/web/vite.config.ts',
  'apps/web/public/favicon.svg', 'apps/web/public/manifest.webmanifest',
  'packages/client/locale/src/locales/en.ts', 'packages/client/locale/src/locales/zh.ts',
  'packages/client/ui-chat/src/client/locale.ts',
  'packages/client/ui-conversation/src/client/locales.ts',
  'packages/client/ui-settings-models/src/client/locales.ts',
  'packages/client/ui-settings-models/tests/welcome-notice.client.spec.tsx',
  'packages/client/ui-chat/tests/chat-view.client.spec.tsx',
  'packages/client/ui-conversation/tests/skeleton.client.spec.tsx',
  'packages/client/ui-sidebar/tests/sidebar-root.client.spec.tsx',
  'packages/client/ui-sidebar/tests/__snapshots__/sidebar-snapshot.client.spec.tsx.snap',
  'apps/web/tests/built-boot.expected.e2e.ts',
  'apps/web/tests/goal-command-presentation.e2e.ts',
  'apps/web/tests/lifecycle-chrome.e2e.ts',
  'apps/web/tests/hmr-live.e2e.ts',
  'apps/web/tests/startup-auto-selection.e2e.ts',
  'apps/web/tests/details-session-lifecycle.e2e.ts',
]);

export function resolveHarnessPath(args, fallback) {
  const paths = args[0] === '--' ? args.slice(1) : args;
  assert.ok(paths.length <= 1, 'Usage: test:integration [--] [Harness checkout]');
  return resolve(paths[0] ?? fallback);
}

/** Pin the upstream ancestry, allowing only metadata and reviewed branding files. */
export async function verifyHarnessCheckout(path, expectedBase) {
  assert.match(expectedBase, /^[a-f0-9]{40}$/);
  const git = async args => (await exec('git', args, { cwd: path, encoding: 'utf8', timeout: 10_000, maxBuffer: 1_048_576 })).stdout;
  const head = (await git(['rev-parse', 'HEAD'])).trim();
  await git(['merge-base', '--is-ancestor', expectedBase, head]);
  // Compare the working tree as well as committed changes; include untracked source.
  const changed = await git(['diff', '--no-ext-diff', '--name-only', '-z', expectedBase, '--']);
  const untracked = await git(['ls-files', '--others', '--exclude-standard', '-z']);
  const unexpected = (changed + untracked).split('\0').filter(path => path && !releaseMetadata.has(path) && !brandingFiles.has(path) && !path.startsWith('deploy/learning-helper/'));
  assert.deepEqual(unexpected, [], 'Harness runtime differs from the pinned base outside reviewed branding files, release metadata and deploy/learning-helper');
  return head;
}
