import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LearningService } from '../services/learning.js';
import { LearningError } from '../domain/errors.js';

const PREFIX = '/learning-helper/v1';
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') throw new LearningError('invalid-input', 'Use application/json');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted); };
    const error = (err: Error) => { cleanup(); reject(err); };
    const aborted = () => error(new LearningError('invalid-input', 'Request aborted'));
    const data = (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > 65_536) { cleanup(); req.pause(); reject(new LearningError('limit-exceeded', 'Request exceeds 64 KiB')); return; }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(new LearningError('invalid-input', 'Invalid JSON')); }
    };
    const timer = setTimeout(() => { cleanup(); req.pause(); reject(new LearningError('invalid-input', 'Request body timeout')); }, 10_000);
    req.on('data', data); req.on('end', end); req.on('error', error); req.on('aborted', aborted);
  });
}
/** Thin HTTP adapter; all grading and durable state transitions are application-owned. */
export function createHandler(service: LearningService, log: (error: unknown) => void, requestRejection: (req: IncomingMessage) => 401 | 403 | undefined) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const rejection = requestRejection(req);
      if (rejection !== undefined) {
        res.setHeader('connection', 'close');
        send(res, rejection, { error: { code: rejection === 401 ? 'unauthorized' : 'forbidden', message: 'Open the authenticated Harness Web session' } });
        return;
      }
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path === `${PREFIX}/health` && req.method === 'GET') { send(res, 200, { status: 'ready', schemaVersion: 1 }); return; }
      const match = /^\/learning-helper\/v1\/courses\/([a-zA-Z0-9_-]+)\/(state|submissions|quizzes\/([a-zA-Z0-9_-]+))$/.exec(path);
      if (!match) { send(res, 404, { error: { code: 'not-found', message: 'Route not found' } }); return; }
      const courseId = match[1]!;
      if (req.method === 'GET' && match[2] === 'state') { send(res, 200, service.getState(courseId)); return; }
      if (req.method === 'GET' && match[3]) { send(res, 200, service.getQuiz(courseId, match[3])); return; }
      if (req.method === 'POST' && match[2] === 'submissions') { send(res, 200, await service.submit(courseId, await readBody(req))); return; }
      send(res, 405, { error: { code: 'invalid-input', message: 'Method not allowed' } });
    } catch (error) {
      const status = error instanceof LearningError ? ({ 'not-found': 404, conflict: 409, 'invalid-input': 400, 'limit-exceeded': 413, unavailable: 503, closed: 503 } as const)[error.code] : 503;
      if (!(error instanceof LearningError)) log(error);
      // Do not retain an unread malicious/slow body on a keep-alive connection.
      if (!req.complete) res.setHeader('connection', 'close');
      send(res, status, { error: { code: error instanceof LearningError ? error.code : 'unavailable',
        message: error instanceof LearningError ? error.message : 'Persistence unavailable; retry with the same submission identity' } });
    }
  };
}
