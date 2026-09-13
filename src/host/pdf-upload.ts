import { constants, createWriteStream, openSync, unlinkSync } from 'node:fs';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { workspaceDirectory, workspacePath, readWorkspaceFile } from '../workspace/files.js';
import { WORKSPACE_LIMITS } from '../domain/assets.js';
import { LearningError } from '../domain/errors.js';

let activeUploads = 0;
/** application/pdf goes straight to a bounded temporary file; no multipart parser or base64 JSON. */
export async function receivePdf(root: string, req: IncomingMessage, signal: AbortSignal): Promise<Uint8Array> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/pdf') throw new LearningError('invalid-input', 'Use application/pdf binary upload');
  if (Number(req.headers['content-length'] ?? 0) > WORKSPACE_LIMITS.pdfBytes) throw new LearningError('limit-exceeded', 'PDF exceeds 64 MiB');
  if (activeUploads >= 4) throw new LearningError('unavailable', 'Upload capacity reached; retry later');
  activeUploads++; let created = false;
  const path = `.learning-helper/tmp/upload-${randomUUID()}.pdf`;
  try {
    workspaceDirectory(root, '.learning-helper/tmp');
    const target = workspacePath(root, path); let size = 0;
    const fd = openSync(target, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    created = true;
    const output = createWriteStream(target, { fd, autoClose: true });
    const bound = new Transform({ transform(chunk: Buffer, _encoding, done) {
      size += chunk.length;
      done(size > WORKSPACE_LIMITS.pdfBytes ? new LearningError('limit-exceeded', 'PDF exceeds 64 MiB') : null, chunk);
    } });
    await pipeline(req, bound, output, { signal: AbortSignal.any([signal, AbortSignal.timeout(30_000)]) });
    return readWorkspaceFile(root, path, WORKSPACE_LIMITS.pdfBytes);
  } finally {
    try { if (created) unlinkSync(workspacePath(root, path)); }
    finally { activeUploads--; }
  }
}
