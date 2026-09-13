import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

/** Release refs must match the durable package identity; never interpolate a ref as shell code. */
export function verifyReleaseVersion(tag, version) {
  assert.match(tag, /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.[1-9]\d*)?$/, 'Expected vX.Y.Z or vX.Y.Z-rc.N/alpha.N/beta.N');
  assert.equal(tag.slice(1), version, 'Release tag must match package.json version');
  return version;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { version } = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(verifyReleaseVersion(process.argv[2], version));
}
