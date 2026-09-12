import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openLearning } from '../../tests/helpers.js';
import { demoCourse, demoSubmission } from '../../src/presets/math-analysis/demo.js';
const dir = await mkdtemp(join(tmpdir(), 'learning-demo-'));
try {
  const h = await openLearning(join(dir, 'state.db'));
  try {
    await h.service.create(demoCourse());
    const result = await h.service.submit('demo-calculus', demoSubmission());
    const state = h.service.getState('demo-calculus');
    console.log(JSON.stringify({ status: state.conceptStates[3]!.status, review: state.reviewQueue,
      revision: result.receipt.revision, day2: state.plan.days[1] }, null, 2));
  } finally { await h.close(); }
} finally { await rm(dir, { recursive: true, force: true }); }
