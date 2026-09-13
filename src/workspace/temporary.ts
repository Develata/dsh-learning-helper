import { existsSync, readdirSync, lstatSync, unlinkSync } from 'node:fs';
import { workspacePath } from './files.js';
import { LearningError } from '../domain/errors.js';

/** Only invoked before a workspace handle accepts requests. Incomplete upload bytes are disposable;
 * archives, canonical assets, database files and unrecognized names are never candidates. */
export function recoverUploads(root: string): number {
  const directory = workspacePath(root, '.learning-helper/tmp');
  if (!existsSync(directory)) return 0;
  const names = readdirSync(directory).filter(n => /^upload-[a-f0-9-]{36}\.pdf$/u.test(n));
  if (names.length > 32) throw new LearningError('unavailable', 'Too many interrupted uploads; explicit temporary-file recovery required');
  const candidates = names.map(name => {
    const path = workspacePath(root, `.learning-helper/tmp/${name}`); const stat = lstatSync(path);
    if (!stat.isFile()) throw new LearningError('unavailable', 'Unexpected temporary upload type');
    return { path, stat };
  });
  for (const { path, stat } of candidates) {
    const current = lstatSync(path);
    if (!current.isFile() || current.ino !== stat.ino || current.size !== stat.size || current.mtimeMs !== stat.mtimeMs) throw new LearningError('unavailable', 'Temporary upload changed during recovery');
  }
  for (const { path } of candidates) unlinkSync(path);
  return candidates.length;
}
