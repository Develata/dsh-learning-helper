import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { demoCourse, demoSubmission } from '../src/presets/math-analysis/demo.js';
import { aggregateSchema } from '../src/domain/model.js';
import { updateConcept } from '../src/policy/adaptation.js';
import { openLearning } from './helpers.js';

const options = { timeout: 15_000 };
async function fixture(t: test.TestContext, path?: string, now?: string) {
  const h = await openLearning(path, now); t.after(() => h.close());
  await h.service.create(demoCourse()); return h;
}

test('five answers produce exactly two uniform-continuity errors, weakness, review and a budgeted Day 2 revision', options, async t => {
  const { service, store } = await fixture(t);
  const result = await service.submit('demo-calculus', demoSubmission());
  assert.equal(result.attempts.length, 5); assert.equal(result.attempts.filter(a => !a.correct).length, 2);
  const state = service.getState('demo-calculus');
  assert.equal(state.conceptStates.find(s => s.conceptId === 'uniform-continuity')?.status, 'weak');
  assert.deepEqual(state.reviewQueue[0]?.evidenceAttemptIds, ['demo-first-submit:q4', 'demo-first-submit:q5']);
  assert.equal(result.receipt.revision?.oldVersion, 1); assert.equal(result.receipt.revision?.newVersion, 2);
  const tasks = state.plan.days[1]!.tasks;
  assert.equal(tasks.find(t => t.type === 'review')?.estimatedMinutes, 20);
  assert.equal(tasks.find(t => t.type === 'practice')?.questionCount, 3);
  assert.equal(tasks.reduce((n, t) => n + t.estimatedMinutes, 0), 60);
  assert.match(state.revisions[0]!.reason, /Uniform Continuity/);
  assert.deepEqual(store.get('demo-calculus')!.plans[0], demoCourse().plans[0]);
  assert.deepEqual(state.plan.days[0], demoCourse().plans[0]!.days[0]);
});

test('same submission including reordered answers returns exactly the same receipt without another durable write', options, async t => {
  const { service, store, ctx } = await fixture(t);
  let changes = 0; ctx.on('domain/changed', () => { changes++; });
  const first = await service.submit('demo-calculus', demoSubmission());
  const input = demoSubmission(); input.answers.reverse();
  assert.deepEqual(await service.submit('demo-calculus', input), first);
  assert.equal(changes, 1); assert.equal(store.get('demo-calculus')!.attempts.length, 5);
});

test('concurrent duplicate submits commit one batch; concurrent different receipts for one quiz conflict', options, async t => {
  const { service, store } = await fixture(t);
  const responses = await Promise.all(Array.from({ length: 12 }, () => service.submit('demo-calculus', demoSubmission())));
  assert.ok(responses.every(r => JSON.stringify(r) === JSON.stringify(responses[0])));
  assert.equal(store.get('demo-calculus')!.attempts.length, 5);
  await assert.rejects(service.submit('demo-calculus', { ...demoSubmission(), submissionId: 'another' }), { code: 'conflict' });
  const changed = demoSubmission(); changed.answers[0]!.selectedOption = 1;
  await assert.rejects(service.submit('demo-calculus', changed), { code: 'conflict' });
});

test('invalid/missing/extra/duplicate answers and client-supplied grading never mutate state', options, async t => {
  const { service, store } = await fixture(t); const before = store.get('demo-calculus');
  const base = demoSubmission();
  const invalid = [
    { ...base, correct: true },
    { ...base, submittedAt: '2020-01-01T00:00:00Z' },
    { ...base, answers: base.answers.slice(1) },
    { ...base, answers: [...base.answers, base.answers[0]] },
    { ...base, answers: base.answers.map((a, i) => i === 0 ? { ...a, selectedOption: 99 } : a) },
    { ...base, answers: base.answers.map((a, i) => i === 0 ? { ...a, itemId: 'alien' } : a) },
  ];
  for (const input of invalid) await assert.rejects(service.submit('demo-calculus', input), { code: 'invalid-input' });
  assert.deepEqual(store.get('demo-calculus'), before);
});

test('unknown course/quiz, archived course and clock reversal are rejected', options, async t => {
  const { service, store } = await fixture(t);
  await assert.rejects(service.submit('missing', demoSubmission()), { code: 'not-found' });
  await assert.rejects(service.submit('demo-calculus', { ...demoSubmission(), quizId: 'missing' }), { code: 'not-found' });
  await store.update('demo-calculus', s => ({ ...s, course: { ...s.course, status: 'archived' } }));
  await assert.rejects(service.submit('demo-calculus', demoSubmission()), { code: 'conflict' });
  const h = await openLearning(':memory:', '2026-09-11T10:00:00.000Z'); t.after(() => h.close());
  await h.service.create(demoCourse());
  await assert.rejects(h.service.submit('demo-calculus', demoSubmission()), { code: 'conflict' });
});

test('answer keys are absent from public state/quiz and caller mutations cannot alter durable state', options, async t => {
  const { service, store } = await fixture(t);
  assert.doesNotMatch(JSON.stringify(service.getQuiz('demo-calculus', 'day-1')), /correctOption|explanation/);
  assert.doesNotMatch(JSON.stringify(service.getState('demo-calculus')), /correctOption|explanation/);
  const projection = service.getState('demo-calculus'); projection.course.title = 'changed';
  const snapshot = store.get('demo-calculus')!; snapshot.quizzes[0]!.items[0]!.correctOption = 1;
  const result = await service.submit('demo-calculus', demoSubmission());
  assert.equal(result.attempts[0]!.correct, true);
  assert.notEqual(service.getState('demo-calculus').course.title, 'changed');
});

test('mastery is monotone in answer correctness at every starting score/difficulty; single error does not mark weak', options, () => {
  const initial = demoCourse().conceptStates[3]!;
  for (const mastery of [0, 0.1, 0.5, 0.95, 1]) for (const difficulty of ['easy', 'medium', 'hard'] as const) for (const correct of [true, false]) {
    const attempt = { id: 's:q', submissionId: 's', courseId: 'demo-calculus', quizId: 'q', itemId: 'q',
      conceptIds: ['uniform-continuity'], selectedAnswer: 0, correct, score: correct ? 1 as const : 0 as const, submittedAt: '2026-09-12T10:00:00.000Z' };
    const next = updateConcept({ ...initial, mastery }, attempt, difficulty);
    assert.ok(correct ? next.mastery >= mastery : next.mastery <= mastery);
    assert.notEqual(next.status, 'weak');
  }
});

test('weakness hysteresis survives one correct answer, then recovers after two and removes review', options, async t => {
  const { service, store } = await fixture(t);
  await service.submit('demo-calculus', demoSubmission());
  for (let i = 0; i < 2; i++) {
    const id = `retest-${i}`;
    await store.update('demo-calculus', s => { const q = structuredClone(s.quizzes[0]!); q.id = id; q.items = [q.items[3]!]; s.quizzes.push(q); return s; });
    await service.submit('demo-calculus', { submissionId: id, quizId: id, answers: [{ itemId: 'q4', selectedOption: 0 }] });
    assert.equal(service.getState('demo-calculus').reviewQueue.length, i === 0 ? 1 : 0);
  }
  assert.notEqual(service.getState('demo-calculus').conceptStates[3]!.status, 'weak');
  assert.equal(store.get('demo-calculus')!.revisions.length, 1);
});

test('additional errors while still weak update evidence without repeatedly rewriting the plan', options, async t => {
  const { service, store } = await fixture(t);
  await service.submit('demo-calculus', demoSubmission());
  await store.update('demo-calculus', s => { s.quizzes.push({ ...structuredClone(s.quizzes[0]!), id: 'retest' }); return s; });
  await service.submit('demo-calculus', { ...demoSubmission(), quizId: 'retest', submissionId: 'retest' });
  assert.equal(store.get('demo-calculus')!.revisions.length, 1);
  assert.equal(service.getState('demo-calculus').reviewQueue[0]!.evidenceAttemptIds.length, 4);
});

test('replanning preserves completed tasks; no capacity or no future day queues review without a fake revision', options, async t => {
  const { service, store } = await fixture(t);
  await store.update('demo-calculus', s => { s.plans[0]!.days[1]!.tasks[0]!.status = 'done'; return s; });
  await service.submit('demo-calculus', demoSubmission());
  assert.equal(service.getState('demo-calculus').plan.version, 1);
  assert.equal(service.getState('demo-calculus').reviewQueue.length, 1);
  const lastDay = await openLearning(':memory:', '2026-09-14T10:00:00.000Z'); t.after(() => lastDay.close());
  await lastDay.service.create(demoCourse()); await lastDay.service.submit('demo-calculus', demoSubmission());
  assert.equal(lastDay.service.getState('demo-calculus').plan.version, 1);
  assert.equal(lastDay.service.getState('demo-calculus').reviewQueue.length, 1);
});

test('SQLite lock failure leaves the entire aggregate unchanged; retry commits after unlocking', options, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'learning-lock-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'learning.db'); const h = await openLearning(path); t.after(() => h.close());
  await h.service.create(demoCourse()); const before = h.store.get('demo-calculus');
  const db = new DatabaseSync(path); t.after(() => db.close());
  db.exec('BEGIN IMMEDIATE');
  await assert.rejects(h.service.submit('demo-calculus', demoSubmission()), /locked/);
  assert.deepEqual(h.store.get('demo-calculus'), before);
  db.exec('ROLLBACK');
  await h.service.submit('demo-calculus', demoSubmission());
  assert.equal(h.service.getState('demo-calculus').plan.version, 2);
});

test('fresh process recovers attempts, review and both plan versions; replay after restart is idempotent', options, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'learning-restart-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'learning.db'); const h = await openLearning(path);
  await h.service.create(demoCourse()); await h.service.submit('demo-calculus', demoSubmission()); await h.close();
  const child = spawnSync(process.execPath, ['--import', 'tsx', 'tests/reopen.ts', path], { encoding: 'utf8', timeout: 10_000 });
  assert.equal(child.status, 0, child.stderr); assert.match(child.stdout, /restart verified/);
});

test('durable corruption and unsupported schema version fail loudly without resetting data', options, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'learning-corrupt-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const path = join(dir, 'learning.db'); const h = await openLearning(path); await h.service.create(demoCourse()); await h.close();
  const db = new DatabaseSync(path);
  db.prepare('UPDATE u_learning_helper_courses SET value = ? WHERE key = ?').run('{}', 'demo-calculus');
  await assert.rejects(openLearning(path), /schema/);
  assert.equal(db.prepare('SELECT value FROM u_learning_helper_courses').get()!.value, '{}');
  db.prepare('UPDATE units SET version = 99 WHERE name = ?').run('learning_helper'); db.close();
  await assert.rejects(openLearning(path), /version/);
});

test('concurrent create is insert-once; close drains accepted writes and rejects new writes', options, async t => {
  const h = await openLearning(); t.after(() => h.close());
  const created = await Promise.allSettled([h.service.create(demoCourse()), h.service.create(demoCourse())]);
  assert.equal(created.filter(r => r.status === 'fulfilled').length, 1);
  const submitted = h.service.submit('demo-calculus', demoSubmission()); const closing = h.store.close();
  await assert.rejects(h.service.submit('demo-calculus', demoSubmission()), { code: 'closed' });
  assert.equal((await submitted).attempts.length, 5); await closing;
});

test('schema rejects foreign ownership, dangling concept and over-budget plan before writing', options, () => {
  const state = demoCourse(); state.quizzes[0]!.courseId = 'alien'; assert.equal(aggregateSchema.safeParse(state).success, false);
  const dangling = demoCourse(); dangling.quizzes[0]!.items[0]!.conceptIds = ['missing']; assert.equal(aggregateSchema.safeParse(dangling).success, false);
  const budget = demoCourse(); budget.plans[0]!.days[0]!.tasks[0]!.estimatedMinutes = 61; assert.equal(aggregateSchema.safeParse(budget).success, false);
});

test('concurrent distinct quizzes retain both batches without lost updates', options, async t => {
  const { service, store } = await fixture(t);
  await store.update('demo-calculus', s => { s.quizzes.push({ ...structuredClone(s.quizzes[0]!), id: 'day-1-extra' }); return s; });
  await Promise.all([
    service.submit('demo-calculus', demoSubmission()),
    service.submit('demo-calculus', { ...demoSubmission(), submissionId: 'extra', quizId: 'day-1-extra' }),
  ]);
  const state = store.get('demo-calculus')!;
  assert.equal(state.attempts.length, 10); assert.equal(state.submissions.length, 2);
  assert.equal(state.conceptStates[3]!.evidenceCount, 4); assert.equal(state.revisions.length, 1);
});

test('bounded writer queue rejects overload and remains usable after draining', options, async t => {
  const { service, store } = await fixture(t);
  const results = await Promise.allSettled(Array.from({ length: 40 }, () => service.submit('demo-calculus', demoSubmission())));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 32);
  for (const r of results) if (r.status === 'rejected') assert.equal(r.reason.code, 'unavailable');
  assert.equal((await service.submit('demo-calculus', demoSubmission())).attempts.length, 5);
  assert.equal(store.get('demo-calculus')!.submissions.length, 1);
});

test('equivalent ISO timestamps with different fractional precision are not a clock reversal', options, async t => {
  const h = await openLearning(':memory:', '2026-09-12T09:00:00.000Z'); t.after(() => h.close());
  await h.service.create(demoCourse('2026-09-12T09:00:00Z'));
  assert.equal((await h.service.submit('demo-calculus', demoSubmission())).attempts.length, 5);
});
