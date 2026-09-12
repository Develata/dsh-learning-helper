import assert from 'node:assert/strict';
import { openLearning } from './helpers.js';
import { demoSubmission } from '../src/presets/math-analysis/demo.js';
const h = await openLearning(process.argv[2]!);
try {
  const before = h.store.get('demo-calculus')!;
  assert.equal(before.attempts.length, 5); assert.equal(before.plans.length, 2);
  assert.equal(before.conceptStates[3]!.status, 'weak'); assert.equal(before.reviewQueue.length, 1);
  await h.service.submit('demo-calculus', demoSubmission());
  assert.deepEqual(h.store.get('demo-calculus'), before);
  console.log('restart verified');
} finally { await h.close(); }
