import type { IncomingMessage, ServerResponse } from 'node:http';
import { send, readBody } from './http.js';
import { LearningError } from '../domain/errors.js';
import { EVIDENCE_LIMITS } from '../domain/evidence.js';
import { WORKSPACE_LIMITS } from '../domain/assets.js';
import type { WorkspaceProjects } from '../workspace/projects.js';
import { projectView } from '../workspace/projection.js';
import { z } from 'zod';
import { validate } from '../services/evidence.js';
import { receivePdf } from './pdf-upload.js';
import { filenameSchema } from '../domain/evidence.js';
import { pdfModeSchema } from '../domain/assets.js';
import { readConfig, writeConfig } from '../workspace/config.js';

/** Authenticated session address is resolved through Harness membership on every request. */
export function workspaceHandler(projects: WorkspaceProjects, reject: (req: IncomingMessage) => 401 | 403 | undefined, log: (error: unknown) => void) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const abort = new AbortController();
    const disconnected = () => { if (!res.writableFinished) abort.abort(new DOMException('Client disconnected', 'AbortError')); };
    res.on('close', disconnected);
    const respond = (status: number, value: unknown) => send(res, status, projectView(value));
    try {
      const rejection = reject(req);
      if (rejection) { res.setHeader('connection', 'close'); respond(rejection, { error: { code: rejection === 401 ? 'unauthorized' : 'forbidden', message: 'Open the authenticated Learning Helper session' } }); return; }
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (/^\/learning-helper\/v[12]\/health$/.test(url.pathname) && req.method === 'GET') { respond(200, { status: 'ready', schemaVersion: 2 }); return; }
      const route = /^\/learning-helper\/v2\/sessions\/([a-zA-Z0-9_-]{1,80})\/(project|config|capabilities|assetize|dashboard|sources(?:\/(?:text|pdf))?|evidence\/(?:search|read)|submissions|quizzes(?:\/([a-zA-Z0-9_-]+)(\/result)?)?)$/.exec(url.pathname);
      if (!route) { respond(404, { error: { code: 'not-found', message: 'Route not found' } }); return; }
      const sessionId = route[1]!; const resource = route[2]!;
      if (resource === 'project') {
        if (req.method === 'GET') { respond(200, projects.status(sessionId)); return; }
        if (req.method === 'POST') { respond(201, { project: await projects.initialize(sessionId, await readBody(req)) }); return; }
      }
      await projects.use(sessionId, abort.signal, async (p, signal) => {
        if (resource === 'config') {
          if (req.method === 'GET') { respond(200, readConfig(p.root)); return; }
          if (req.method === 'POST') { respond(200, writeConfig(p.root, await readBody(req))); return; }
        }
        if (resource === 'capabilities' && req.method === 'GET') {
          respond(200, { vision: await projects.visionAvailable(sessionId, signal) }); return;
        }
        if (resource === 'assetize' && req.method === 'POST') {
          const job = p.assetization.start(await readBody(req), signal);
          respond(job.accepted ? 202 : 200, { status: job.accepted ? 'processing' : 'ready' });
          try { await job.done; } catch (error) { if (!(error instanceof LearningError)) log(error); }
          return;
        }
        if (req.method === 'GET' && resource === 'dashboard') { respond(200, p.learning.getDashboard(p.projectId)); return; }
        if (req.method === 'GET' && resource === 'sources') {
          const usage = p.assets.usage();
          respond(200, { sources: p.evidence.listSources(p.projectId, signal), usage, sourceWarning: usage.sourceCount >= WORKSPACE_LIMITS.sourceWarning }); return;
        }
        if (req.method === 'POST' && resource === 'sources/text') {
          const result = await p.evidence.importText(p.projectId, await readBody(req, EVIDENCE_LIMITS.sourceBodyBytes), signal);
          respond(result.deduplicated ? 200 : 201, { ...result, source: p.assets.getSource(result.source.id) }); return;
        }
        if (req.method === 'POST' && resource === 'sources/pdf') {
          const input = validate(z.strictObject({ filename: filenameSchema, mode: pdfModeSchema }), { filename: url.searchParams.get('filename'), mode: url.searchParams.get('mode') ?? 'auto' });
          const bytes = await receivePdf(p.root, req, signal);
          const operation = p.pdf.import(input, bytes, { sessionId }, signal);
          // Admission is durable before the expensive parse. Host owns the bounded continuation.
          respond(202, { status: 'processing', sourceId: p.pdf.identify(bytes) });
          try { await operation; } catch (error) { if (!(error instanceof LearningError)) log(error); }
          return;
        }
        if (req.method === 'GET' && resource === 'evidence/search') {
          respond(200, p.evidence.search({ courseId: p.projectId, query: url.searchParams.get('query'), ...(url.searchParams.has('limit') ? { limit: Number(url.searchParams.get('limit')) } : {}) }, signal)); return;
        }
        if (req.method === 'POST' && resource === 'evidence/read') {
          const body = validate(z.strictObject({ chunkIds: z.array(z.string()).min(1).max(8) }), await readBody(req));
          respond(200, p.evidence.read({ ...body, courseId: p.projectId }, signal)); return;
        }
        if (req.method === 'GET' && resource === 'quizzes') { respond(200, { quizzes: p.learning.listQuizzes(p.projectId) }); return; }
        if (req.method === 'GET' && route[3]) {
          respond(200, route[4] ? { result: p.learning.getQuizResult(p.projectId, route[3]) } : p.learning.getQuiz(p.projectId, route[3])); return;
        }
        if (req.method === 'POST' && resource === 'submissions') { const body = await readBody(req); signal.throwIfAborted(); respond(200, await p.learning.submit(p.projectId, body)); return; }
        respond(405, { error: { code: 'invalid-input', message: 'Method not allowed' } });
      });
    } catch (error) {
      const status = error instanceof LearningError ? ({ 'not-found': 404, conflict: 409, 'invalid-input': 400, 'limit-exceeded': 413, unavailable: 503, closed: 503 } as const)[error.code] : 503;
      if (!(error instanceof LearningError)) log(error);
      if (!req.complete) res.setHeader('connection', 'close');
      respond(status, { error: { code: error instanceof LearningError ? error.code : 'unavailable', message: error instanceof LearningError ? error.message : 'Workspace storage unavailable; retry or inspect recovery state' } });
    } finally { res.off('close', disconnected); }
  };
}
