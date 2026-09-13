import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { CredentialKey, CredentialRecord } from '@deepseek-ai/dsh-credentials';
import { MinerUAccess } from '../src/services/mineru-access.js';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import { WorkspaceResolver, initializeProject } from '../src/workspace/context.js';
import { workspaceHandler } from '../src/host/workspace-http.js';

const signal = () => AbortSignal.timeout(5000);
function credentials() {
  const records = new Map<CredentialKey, CredentialRecord>();
  return { records,
    async readRecord(key: CredentialKey) { return records.get(key); },
    async describeRecord(key: CredentialKey) { return { configured: records.has(key), writable: true }; },
    async modifyRecord(key: CredentialKey, mutate: (old: CredentialRecord | undefined) => Promise<CredentialRecord | undefined>) {
      const record = await mutate(records.get(key)); if (record) records.set(key, record); return record;
    },
    async deleteRecord(key: CredentialKey) { records.delete(key); },
  };
}
test('cloud credentials use distinct stable project keys, never return the secret and take effect without restart', async () => {
  const store = credentials(); const service = new MinerUAccess(store);
  assert.deepEqual(await service.status('A', signal()), { configured: false, writable: true });
  const result = await service.save('A', { token: 'fixture-secret-A' }, signal());
  assert.deepEqual(result, { configured: true, writable: true }); assert.doesNotMatch(JSON.stringify(result), /fixture|token|key/);
  assert.equal((await service.status('B', signal())).configured, false);
  await service.save('B', { token: 'fixture-secret-B' }, signal()); assert.equal(store.records.size, 2);
  await service.save('A', { token: 'replacement' }, signal()); assert.equal(store.records.size, 2);
  assert.equal((await new MinerUAccess(store).status('A', signal())).configured, true);
  assert.ok(await service.adapter('A', { enabled: true, provider: 'cloud', backend: 'pipeline', timeoutSeconds: 10 }, signal()));
  assert.equal((await service.remove('A', signal())).configured, false);
  assert.equal((await service.status('B', signal())).configured, true);
  await assert.rejects(service.save('A', { token: 'Bearer secret' }, signal()));
  await assert.rejects(service.save('A', { token: 'x'.repeat(8193) }, signal()));
  await assert.rejects(service.save('A', { token: 'valid', projectId: 'B' }, signal()));
  await assert.rejects(service.adapter('A', { enabled: true, provider: 'cloud', backend: 'pipeline', timeoutSeconds: 10 }, signal()), /Save/);
});

test('credential provider errors never expose secret-bearing diagnostics; cancelled requests cannot begin a write', async () => {
  const store = credentials();
  const service = new MinerUAccess({ ...store, async modifyRecord() { throw new Error('fixture-secret-in-provider-error'); } });
  await assert.rejects(service.save('A', { token: 'fixture' }, signal()), error => {
    assert.doesNotMatch(String(error), /fixture/); return true;
  });
  await assert.rejects(new MinerUAccess(store).save('A', { token: 'fixture' }, AbortSignal.abort()));
  assert.equal(store.records.size, 0);
});

test('credential Host API is authenticated, session scoped, bounded, no-store and keeps Workspace config secret-free', async t => {
  const root = mkdtempSync(join(tmpdir(), 'lh-cloud-key-')); const b = mkdtempSync(join(tmpdir(), 'lh-cloud-key-b-'));
  await initializeProject(root, { title: 'A', subject: 'Math', dailyMinutes: 60 });
  await initializeProject(b, { title: 'B', subject: 'Math', dailyMinutes: 60 });
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['a'] }, { path: b, sessionIds: ['b'] }]));
  const store = credentials(); const logs: unknown[] = [];
  const host = createServer(workspaceHandler(projects, req => req.headers.authorization === 'fixture' ? undefined : 401, e => logs.push(e), new MinerUAccess(store)));
  host.listen(0, '127.0.0.1'); await once(host, 'listening');
  t.after(async () => { host.closeAllConnections(); host.close(); await projects.close(); rmSync(root, { recursive: true, force: true }); rmSync(b, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${(host.address() as { port: number }).port}/learning-helper/v2/sessions/`;
  const request = (session: string, method = 'GET', body?: unknown, authenticated = true) => fetch(base + session + '/mineru-credential', {
    method, headers: { ...(authenticated ? { authorization: 'fixture' } : {}), 'content-type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: signal(),
  });
  assert.equal((await request('a', 'POST', { token: 'fixture-http-key' }, false)).status, 401);
  assert.equal(store.records.size, 0);
  const saved = await request('a', 'POST', { token: 'fixture-http-key' }); assert.equal(saved.status, 200);
  assert.equal(saved.headers.get('cache-control'), 'no-store'); assert.deepEqual(await saved.json(), { configured: true, writable: true });
  assert.deepEqual(await (await request('b')).json(), { configured: false, writable: true });
  assert.equal((await request('nonexistent', 'POST', { token: 'fixture' })).status, 503);
  assert.equal((await request('a', 'POST', { token: 'a'.repeat(17 * 1024) })).status, 413);
  assert.equal((await request('a', 'POST', { token: 'fixture', workspaceRoot: b })).status, 400);
  assert.doesNotMatch(readFileSync(join(root, '.learning-helper/config.json'), 'utf8'), /token|fixture-http-key/);
  assert.deepEqual(await (await request('a', 'DELETE')).json(), { configured: false, writable: true });
  assert.deepEqual(logs, []);
});
