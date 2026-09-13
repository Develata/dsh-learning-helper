/** Optional local capacity measurement; no provider calls or user data. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceProjects } from '../src/workspace/projects.js';
import { WorkspaceResolver } from '../src/workspace/context.js';
const root = await mkdtemp(join(tmpdir(), 'lh-evidence-capacity-'));
const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['benchmark'] }]));
const signal = AbortSignal.timeout(120_000);
try {
  await projects.initialize('benchmark', { title: 'Isolated capacity fixture', subject: 'Benchmark', dailyMinutes: 60 });
  const started = performance.now();
  await projects.use('benchmark', signal, async p => {
    for (let i = 0; i < 200; i++) await p.evidence.importText(p.projectId, {
      filename: `source-${i}.txt`, mimeType: 'text/plain', text: `Source ${i}\n` + 'bounded mathematical evidence. '.repeat(8192),
    }, signal);
    const importMs = performance.now() - started;
    const measured = (query: string) => { const start = performance.now(); const results = p.evidence.search({ courseId: p.projectId, query, limit: 20 }, signal); return { query, ms: performance.now() - start, results: results.results.length }; };
    console.log(JSON.stringify({ sources: 200, usage: p.assets.usage(), importMs, queries: [measured('mathematical'), measured('不存在'), measured('缺失')], semanticLlmRun: false }, null, 2));
  });
} finally { await projects.close(); await rm(root, { recursive: true, force: true }); }
