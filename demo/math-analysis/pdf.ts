import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceProjects } from '../../src/workspace/projects.js';
import { WorkspaceResolver } from '../../src/workspace/context.js';
import { makePdf } from '../../tests/pdf-fixture.js';
const root = mkdtempSync(join(tmpdir(), 'lh-demo-pdf-')); const signal = new AbortController().signal;
const projects = new WorkspaceProjects(new WorkspaceResolver(() => [{ path: root, sessionIds: ['pdf-demo'] }]));
try {
  await projects.initialize('pdf-demo', { title: 'PDF evidence', subject: 'Analysis', dailyMinutes: 60 });
  await projects.use('pdf-demo', signal, async p => {
    const bytes = makePdf([{ text: 'Continuity and limits on a closed interval.' }, { text: 'Heine Cantor: continuous functions on compact domains are uniformly continuous.' }]);
    const source = await p.pdf.import({ filename: 'original-demo.pdf', mode: 'local-fast' }, bytes, { sessionId: 'pdf-demo' }, signal);
    const hits = p.evidence.search({ courseId: p.projectId, query: 'Heine Cantor' }).results;
    const read = p.evidence.read({ courseId: p.projectId, chunkIds: hits.map(h => h.chunkId) });
    assert.equal(read.chunks[0]?.citationLabel, 'original-demo.pdf · p.2');
    console.log(JSON.stringify({ actualPdfjs: true, semanticLlmRun: false, originalArchived: !!source.source.originalAsset, pageCount: source.source.pageCount, read }, null, 2));
  });
} finally { await projects.close(); rmSync(root, { recursive: true, force: true }); }
