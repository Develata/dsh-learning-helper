import test from 'node:test';
import assert from 'node:assert/strict';
import { demoCourse, demoSubmission } from '../src/presets/math-analysis/demo.js';
import { openLearning } from './helpers.js';

test('valid long concept names cannot prevent grading or overflow generated reasons', async t => {
  const h = await openLearning(); t.after(() => h.close());
  const state = demoCourse();
  state.course.dailyMinutes = 240;
  for (const concept of state.concepts) concept.name = '数'.repeat(4000);
  // Two errors on every concept exercise both individual and combined reason bounds.
  const item = state.quizzes[0]!.items[3]!;
  item.conceptIds = state.concepts.map(c => c.id);
  state.quizzes[0]!.items = [item, { ...structuredClone(item), id: 'second' }];
  await h.service.create(state);
  const result = await h.service.submit(state.course.id, { submissionId: 'long-names', quizId: 'day-1',
    answers: [{ itemId: item.id, selectedOption: 1 }, { itemId: 'second', selectedOption: 1 }] });
  assert.equal(result.attempts.length, 2);
  const updated = h.service.getState(state.course.id);
  assert.equal(updated.reviewQueue.length, 4);
  assert.equal(updated.plan!.version, 2);
  assert.equal(updated.plan!.days[1]!.tasks.filter(t => t.type === 'review').length, 4);
  assert.ok(updated.revisions[0]!.reason.length <= 4000);
  assert.equal(updated.concepts[0]!.name, state.concepts[0]!.name);
});

test('generated task identities cannot collide with existing plan tasks', async t => {
  const h = await openLearning(); t.after(() => h.close());
  const state = demoCourse();
  state.plans[0]!.days[0]!.tasks[0]!.id = 'v2-review-0';
  state.plans[0]!.days[2]!.tasks[0]!.id = 'v2-practice-0';
  await h.service.create(state);
  await h.service.submit(state.course.id, demoSubmission());
  const plan = h.service.getState(state.course.id).plan;
  assert.ok(plan);
  const ids = plan.days.flatMap(d => d.tasks.map(t => t.id));
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(plan.days[0], state.plans[0]!.days[0]);
  assert.deepEqual(plan.days[2], state.plans[0]!.days[2]);
  assert.equal(plan.version, 2);
});

test('replanning respects task slots as well as time and preserves completed work', async t => {
  const h = await openLearning(); t.after(() => h.close());
  const state = demoCourse(); state.course.dailyMinutes = 240;
  const day = state.plans[0]!.days[1]!;
  day.tasks = Array.from({ length: 49 }, (_, i) => ({ ...day.tasks[0]!, id: `done-${i}`,
    estimatedMinutes: 1, status: 'done' as const }));
  await h.service.create(state);
  const result = await h.service.submit(state.course.id, demoSubmission());
  assert.equal(result.attempts.length, 5);
  const updated = h.service.getState(state.course.id);
  assert.equal(updated.plan!.version, 1);
  assert.equal(updated.reviewQueue.length, 1);
  assert.deepEqual(updated.plan!.days[1], day);
});

test('remaining pending work cannot overflow the revised day task limit', async t => {
  const h = await openLearning(); t.after(() => h.close());
  const state = demoCourse(); state.course.dailyMinutes = 240;
  const day = state.plans[0]!.days[1]!;
  day.tasks = Array.from({ length: 50 }, (_, i) => ({ ...day.tasks[0]!, id: `pending-${i}`, estimatedMinutes: 1 }));
  await h.service.create(state);
  await h.service.submit(state.course.id, demoSubmission());
  const updated = h.service.getState(state.course.id);
  assert.equal(updated.plan!.version, 2);
  assert.equal(updated.plan!.days[1]!.tasks.length, 50);
  assert.equal(updated.plan!.days[1]!.tasks.filter(t => t.type === 'review').length, 1);
});
