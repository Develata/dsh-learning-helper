import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLearning } from '../../tests/helpers.js';
import { EvidenceService } from '../../src/services/evidence.js';
import { SqliteEvidenceStore } from '../../src/providers/evidence-sqlite.js';
import { TextParser } from '../../src/providers/text-parser.js';
const dir = await mkdtemp(join(tmpdir(), 'learning-evidence-demo-'));
try {
  const learning = await openLearning(join(dir, 'state.db'));
  const evidence = new EvidenceService(learning.service, new SqliteEvidenceStore(join(dir, 'evidence.db')), new TextParser());
  try {
    const course = await learning.service.createCourse({ id: 'analysis', title: '数学分析', subject: 'calculus', dailyMinutes: 60 });
    const text = await readFile(new URL('./lecture-03.md', import.meta.url), 'utf8');
    const imported = await evidence.importText(course.id, { filename: 'Lecture 03.md', mimeType: 'text/markdown', text });
    const search = evidence.search({ courseId: course.id, query: 'Heine Cantor' });
    const read = evidence.read({ courseId: course.id, chunkIds: search.results.map(r => r.chunkId) });
    if (!read.chunks.length) throw new Error('Demo evidence is missing');
    console.log(JSON.stringify({ course, plan: learning.service.getState(course.id).plan, source: imported.source,
      evidence: read, citation: `[${read.chunks[0]!.citationLabel}](${read.chunks[0]!.canonicalRef})`, semanticLlmRun: false }, null, 2));
  } finally { await evidence.close(); await learning.close(); }
} finally { await rm(dir, { recursive: true, force: true }); }
