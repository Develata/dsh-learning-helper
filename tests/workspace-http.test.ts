import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import { WorkspaceResolver, initializeProject } from '../src/workspace/context.js';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import { readConfig, writeConfig } from '../src/workspace/config.js';
import { workspaceHandler } from '../src/host/workspace-http.js';
import { makePdf } from './pdf-fixture.js';

test('session PDF upload honors the workspace default and an explicit per-import override', async t => {
  const root = mkdtempSync(join(tmpdir(), 'lh-workspace-http-'));
  await initializeProject(root, { title: 'PDF defaults', subject: 'Analysis', dailyMinutes: 60 });
  const config = readConfig(root); config.documentParsing.pdfMode = 'local-fast'; writeConfig(root, config);
  let visualCalls = 0;
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['session'] }]), {
    async available() { return { available: true, cacheKey: 'http-test' }; },
    async understandPages(_context, pages) { visualCalls++; return pages.map(page => ({ page: page.page, text: 'Visual HTTP theorem' })); },
  });
  const errors: unknown[] = [];
  const server = createServer(workspaceHandler(projects, req => req.headers.authorization === 'fixture' ? undefined : 401, e => errors.push(e)));
  t.after(async () => {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await projects.close(); rmSync(root, { recursive: true, force: true });
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/learning-helper/v2/sessions/session`;
  const bytes = makePdf([{ text: 'A complete normal local page about compactness and continuity.' }, { image: true }]);
  const upload = (mode = '', authenticated = true) => fetch(base + '/sources/pdf?filename=lecture.pdf' + mode, {
    method: 'POST', headers: { 'content-type': 'application/pdf', ...(authenticated ? { authorization: 'fixture' } : {}) },
    body: Buffer.from(bytes), signal: AbortSignal.timeout(10_000),
  });
  assert.equal((await upload('', false)).status, 401);
  async function completed(mode = '') {
    const response = await upload(mode); assert.equal(response.status, 202);
    const { sourceId } = await response.json();
    await assert.doesNotReject(async () => {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const result = await fetch(base + '/sources', { headers: { authorization: 'fixture' }, signal: AbortSignal.timeout(1000) });
        const { sources } = await result.json();
        const source = sources.find((s: { id: string }) => s.id === sourceId);
        if (source?.parsing !== 'processing') { assert.equal(source?.parsing, 'ready'); return; }
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw new Error('PDF did not settle');
    });
  }
  await completed(); assert.equal(visualCalls, 0, 'workspace local-fast default must not call a visual provider');
  await completed('&mode=high-accuracy'); assert.equal(visualCalls, 2);
  assert.equal(readConfig(root).documentParsing.pdfMode, 'local-fast', 'per-import choice does not overwrite workspace preference');
  assert.deepEqual(errors, []);
});
