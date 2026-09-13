import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyReleaseVersion } from '../scripts/release-version.mjs';

test('release identity rejects drift, malformed refs, and implicit development releases', () => {
  assert.equal(verifyReleaseVersion('v0.2.0', '0.2.0'), '0.2.0');
  assert.equal(verifyReleaseVersion('v0.2.1-rc.1', '0.2.1-rc.1'), '0.2.1-rc.1');
  for (const tag of ['main', 'v01.2.0', 'v0.2.0-dev', 'v0.2.0;echo test', 'v0.2.0-rc.0', 'v0.2.0\n']) {
    assert.throws(() => verifyReleaseVersion(tag, tag.slice(1)));
  }
  assert.throws(() => verifyReleaseVersion('v0.2.1', '0.2.0'));
});
