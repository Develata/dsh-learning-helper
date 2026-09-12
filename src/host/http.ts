import type { IncomingMessage, ServerResponse } from 'node:http';
import type { LearningService } from '../services/learning.js';
import { LearningError } from '../domain/errors.js';
import type { EvidenceService } from '../services/evidence.js';
import { EVIDENCE_LIMITS } from '../domain/evidence.js';

const PREFIX = '/learning-helper/v1';
function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function readBody(req: IncomingMessage, maxBytes = 65_536): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') throw new LearningError('invalid-input', 'Use application/json');
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []; let size = 0;
    const cleanup = () => { clearTimeout(timer); req.off('data', data); req.off('end', end); req.off('error', error); req.off('aborted', aborted); };
    const error = (err: Error) => { cleanup(); reject(err); };
    const aborted = () => error(new LearningError('invalid-input', 'Request aborted'));
    const data = (chunk: Buffer) => {
      size += chunk.byteLength;
      if (size > maxBytes) { cleanup(); req.pause(); reject(new LearningError('limit-exceeded', `Request exceeds ${maxBytes} bytes`)); return; }
      chunks.push(chunk);
    };
    const end = () => {
      cleanup();
      try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { reject(new LearningError('invalid-input', 'Invalid JSON')); }
    };
    const timer = setTimeout(() => { cleanup(); req.pause(); reject(new LearningError('invalid-input', 'Request body timeout')); }, 10_000);
    req.on('data', data); req.on('end', end); req.on('error', error); req.on('aborted', aborted);
  });
}
/** Thin HTTP adapter; all grading and durable state transitions are application-owned. */
export function createHandler(service: LearningService, log: (error: unknown) => void, requestRejection: (req: IncomingMessage) => 401 | 403 | undefined, evidence?: EvidenceService) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const controller = new AbortController();
    const disconnected = () => { if (!res.writableFinished) controller.abort(new DOMException('Client disconnected', 'AbortError')); };
    res.on('close', disconnected);
    try {
      const rejection = requestRejection(req);
      if (rejection !== undefined) {
        res.setHeader('connection', 'close');
        send(res, rejection, { error: { code: rejection === 401 ? 'unauthorized' : 'forbidden', message: 'Open the authenticated Harness Web session' } });
        return;
      }
      const path = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (path === `${PREFIX}/health` && req.method === 'GET') { send(res, 200, { status: 'ready', schemaVersion: 1 }); return; }
      if (path === `${PREFIX}/courses` && req.method === 'POST') { send(res, 201, { course: await service.createCourse(await readBody(req)) }); return; }
      if (path === `${PREFIX}/courses` && req.method === 'GET') { send(res, 200, { courses: service.listCourses() }); return; }
      const evidenceRoute = /^\/learning-helper\/v1\/courses\/([a-zA-Z0-9_-]+)\/(sources(?:\/text)?|evidence\/(search|read))$/.exec(path);
      if (evidenceRoute && evidence) {
        const courseId = evidenceRoute[1]!;
        if (req.method === 'GET' && evidenceRoute[2] === 'sources') { send(res, 200, { sources: evidence.listSources(courseId, controller.signal) }); return; }
        if (req.method === 'POST' && evidenceRoute[2] === 'sources/text') {
          const result = await evidence.importText(courseId, await readBody(req, EVIDENCE_LIMITS.sourceBodyBytes), controller.signal);
          send(res, result.deduplicated ? 200 : 201, result); return;
        }
        if (req.method === 'GET' && evidenceRoute[3] === 'search') {
          const query = new URL(req.url!, 'http://localhost').searchParams;
          send(res, 200, evidence.search({ courseId, query: query.get('query'), ...(query.has('limit') ? { limit: Number(query.get('limit')) } : {}) }, controller.signal)); return;
        }
        if (req.method === 'POST' && evidenceRoute[3] === 'read') {
          const body = await readBody(req);
          if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(k => k !== 'chunkIds')) throw new LearningError('invalid-input', 'Use { chunkIds }');
          send(res, 200, evidence.read({ ...body, courseId }, controller.signal)); return;
        }
        send(res, 405, { error: { code: 'invalid-input', message: 'Method not allowed' } }); return;
      }
      const match = /^\/learning-helper\/v1\/courses\/([a-zA-Z0-9_-]+)\/(state|dashboard|submissions|quizzes(?:\/([a-zA-Z0-9_-]+)(\/result)?)?)$/.exec(path);
      if (!match) { send(res, 404, { error: { code: 'not-found', message: 'Route not found' } }); return; }
      const courseId = match[1]!;
      if (req.method === 'GET' && match[2] === 'state') { send(res, 200, service.getState(courseId)); return; }
      if (req.method === 'GET' && match[2] === 'dashboard') { send(res, 200, service.getDashboard(courseId)); return; }
      if (req.method === 'GET' && match[2] === 'quizzes') { send(res, 200, { quizzes: service.listQuizzes(courseId) }); return; }
      if (req.method === 'GET' && match[3] && match[4]) { send(res, 200, { result: service.getQuizResult(courseId, match[3]) }); return; }
      if (req.method === 'GET' && match[3]) { send(res, 200, service.getQuiz(courseId, match[3])); return; }
      if (req.method === 'POST' && match[2] === 'submissions') { send(res, 200, await service.submit(courseId, await readBody(req))); return; }
      send(res, 405, { error: { code: 'invalid-input', message: 'Method not allowed' } });
    } catch (error) {
      const status = error instanceof LearningError ? ({ 'not-found': 404, conflict: 409, 'invalid-input': 400, 'limit-exceeded': 413, unavailable: 503, closed: 503 } as const)[error.code] : 503;
      if (!(error instanceof LearningError)) log(error);
      // Do not retain an unread malicious/slow body on a keep-alive connection.
      if (!req.complete) res.setHeader('connection', 'close');
      send(res, status, { error: { code: error instanceof LearningError ? error.code : 'unavailable',
        message: error instanceof LearningError ? error.message : 'Persistence unavailable; retry the same operation' } });
    } finally { res.off('close', disconnected); }
  };
}
