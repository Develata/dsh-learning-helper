import test from 'node:test';
import assert from 'node:assert/strict';
import { openLearning } from './helpers.js';
import { demoCourse, demoSubmission } from '../src/presets/math-analysis/demo.js';

const draft = { id: 'new-course', title: '数学分析', subject: 'calculus', dailyMinutes: 60 };
test('createCourse persists an honest empty setup state and exposes only course metadata', async t => {
  const h = await openLearning(); t.after(() => h.close());
  const course = await h.service.createCourse(draft);
  assert.equal(course.status, 'active');
  assert.equal(course.createdAt, '2026-09-12T10:00:00.000Z');
  const state = h.service.getState(course.id);
  assert.deepEqual(state.concepts, []); assert.deepEqual(state.conceptStates, []);
  assert.equal(state.plan, null); assert.equal(h.store.get(course.id)!.plans.length, 0);
  assert.deepEqual(h.service.listCourses(), [course]);
  await assert.rejects(h.service.createCourse(draft), { code: 'conflict' });
  await assert.rejects(h.service.createCourse({ ...draft, id: 'bad', mastery: 1 }), { code: 'invalid-input' });
  await assert.rejects(h.service.submit(course.id, demoSubmission()), { code: 'not-found' });
});
test('a published quiz without an initial plan fails with a domain conflict and leaves no attempts', async t => {
  const h = await openLearning(); t.after(() => h.close());
  const state = demoCourse(); state.plans = [];
  await h.service.create(state);
  await assert.rejects(h.service.submit(state.course.id, demoSubmission()), { code: 'conflict' });
  assert.deepEqual(h.store.get(state.course.id), state);
});
