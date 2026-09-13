import { constants, readdirSync, lstatSync, realpathSync, mkdirSync, openSync, closeSync, writeFileSync, fsyncSync, renameSync, readSync, fstatSync, unlinkSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep, dirname, basename } from 'node:path';
import { randomUUID } from 'node:crypto';
import { LearningError } from '../domain/errors.js';

/** Root is supplied by official Workspace resolution, never model or upload arguments. */
export function canonicalRoot(root: string): string {
  const canonical = realpathSync(root);
  if (!lstatSync(canonical).isDirectory()) throw new LearningError('invalid-input', 'Workspace must be a local directory');
  return canonical;
}
export function relativeAssetPath(value: string): string {
  if (!value || value.length > 500 || value.includes('\\') || /[\x00-\x1f]/u.test(value) || isAbsolute(value)
    || value.split('/').some(p => !p || p === '.' || p === '..')) throw new LearningError('invalid-input', 'Invalid workspace-relative asset path');
  return value;
}
/** Reject every symlink component, including in-workspace links, to keep write ownership simple. */
export function workspacePath(root: string, path: string): string {
  relativeAssetPath(path);
  if (realpathSync(root) !== root) throw new LearningError('unavailable', 'Workspace root changed; reopen its session');
  const target = resolve(root, path); const rel = relative(root, target);
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new LearningError('invalid-input', 'Path escapes workspace');
  let part = root;
  for (const component of path.split('/')) {
    part = resolve(part, component);
    try { if (lstatSync(part).isSymbolicLink()) throw new LearningError('invalid-input', 'Workspace assets cannot use symlinks'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }
  return target;
}
export function workspaceDirectory(root: string, path: string): string {
  const target = workspacePath(root, path); mkdirSync(target, { recursive: true, mode: 0o700 });
  workspacePath(root, path); return target;
}
export function workspaceDatabasePath(root: string, path: string): string {
  for (const suffix of ['-wal', '-shm', '-journal']) workspacePath(root, `${path}${suffix}`);
  return workspacePath(root, path);
}
export function readWorkspaceFile(root: string, path: string, maxBytes: number): Buffer {
  const target = workspacePath(root, path);
  if (lstatSync(target).size > maxBytes || !lstatSync(target).isFile()) throw new LearningError('limit-exceeded', 'Workspace file exceeds limit');
  const fd = openSync(target, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > maxBytes) throw new LearningError('limit-exceeded', 'Workspace file exceeds limit');
    // Bound allocation and reads even if a local editor grows the file after stat.
    const parts: Buffer[] = []; let total = 0;
    while (total <= maxBytes) {
      const part = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1 - total));
      const count = readSync(fd, part);
      if (!count) return Buffer.concat(parts, total);
      total += count; parts.push(part.subarray(0, count));
    }
    throw new LearningError('limit-exceeded', 'Workspace file exceeds limit');
  }
  finally { closeSync(fd); }
}
/** Publish a complete sibling temporary file. Existing state is never partially overwritten. */
export function writeWorkspaceFile(root: string, path: string, bytes: string | Uint8Array): void {
  const target = workspacePath(root, path);
  const parent = relative(root, dirname(target)).split(sep).join('/');
  if (parent) workspaceDirectory(root, parent);
  if (readdirSync(dirname(target)).some(name => name.startsWith(`${basename(target)}.tmp-`)))
    throw new LearningError('unavailable', 'Interrupted file publication requires inspection of the retained sibling temporary file');
  const temp = `${path}.tmp-${randomUUID()}`;
  const temporary = workspacePath(root, temp);
  const fd = openSync(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
  try {
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    workspacePath(root, path); renameSync(temporary, target);
  }
  catch (error) { try { unlinkSync(temporary); } catch (cleanup) { if ((cleanup as NodeJS.ErrnoException).code !== 'ENOENT') throw new AggregateError([error, cleanup], 'File publish and cleanup failed'); } throw error; }
  syncDirectory(dirname(target));
}
export function syncDirectory(path: string): void {
  const directory = openSync(path, constants.O_RDONLY | constants.O_DIRECTORY);
  try { fsyncSync(directory); } finally { closeSync(directory); }
}
