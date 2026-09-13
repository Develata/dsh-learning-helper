import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { LearningError } from '../src/domain/errors.js';
import { openAuthoring, authoringDrafts } from './authoring-helpers.js';
import { CourseAuthoringService } from '../src/services/authoring.js';
import { EvidenceService } from '../src/services/evidence.js';
import { SqliteEvidenceStore } from '../src/providers/evidence-sqlite.js';
import { TextParser } from '../src/providers/text-parser.js';

async function fixture(t: test.TestContext) {
  const h = await openAuthoring(); t.after(() => h.close());
  return { ...h, drafts: await authoringDrafts(h) };
}
const code = (expected: string) => (e: unknown) => e instanceof LearningError && e.code === expected;

test('learning context reports actual setup progress, bounded quiz history and submission state without mutating either plane', async t => {
  const h = await openAuthoring(); t.after(() => h.close());
  await h.service.createCourse({ id: 'empty', title: 'Empty', subject: 'calculus', dailyMinutes: 60 });
  const empty = h.authoring.learningContext({ courseId: 'empty' });
  assert.equal(empty.stage, 'needs_material'); assert.deepEqual(empty.sources, []);
  assert.equal(empty.quizCount, 0); assert.deepEqual(empty.recentQuizzes, []);
  const drafts = await authoringDrafts(h);
  const state = () => h.authoring.learningContext({ courseId: 'authoring' });
  assert.equal(state().stage, 'needs_outline');
  assert.equal(state().sources[0]!.status, 'ready');
  await h.authoring.publishOutline(drafts.outline); assert.equal(state().stage, 'needs_plan');
  await h.authoring.publishInitialPlan(drafts.plan); assert.equal(state().stage, 'ready');
  for (let n = 0; n < 12; n++) await h.authoring.publishQuiz({ ...drafts.quiz, purpose: `Practice ${n}` });
  const beforeSubmit = state();
  assert.equal(beforeSubmit.quizCount, 12); assert.equal(beforeSubmit.unsubmittedQuizCount, 12);
  assert.equal(beforeSubmit.recentQuizzes.length, 10);
  assert.equal(beforeSubmit.recentQuizzes[0]!.purpose, 'Practice 11');
  assert.equal(beforeSubmit.recentQuizzes[9]!.purpose, 'Practice 2');
  assert.equal(beforeSubmit.recentQuizzes[0]!.correctCount, null);
  const quiz = h.service.getQuiz('authoring', beforeSubmit.recentQuizzes[0]!.id);
  await h.service.submit('authoring', { submissionId: 'context-submit', quizId: quiz.id,
    answers: quiz.items.map((i, n) => ({ itemId: i.id, selectedOption: n < 3 ? 0 : 1 })) });
  const saved = h.store.get('authoring');
  const sources = h.evidence.listSources('authoring');
  // This projection needs metadata, never evidence text or quiz answer keys.
  t.mock.method(h.evidence, 'read', () => { throw new Error('Unexpected corpus read'); });
  const get = t.mock.method(h.store, 'get');
  const after = state();
  assert.equal(get.mock.callCount(), 1, 'Context and quiz summaries must share one learning snapshot');
  assert.equal(after.stage, 'ready'); assert.equal(after.currentPlan!.version, 2);
  assert.equal(after.unsubmittedQuizCount, 11);
  assert.equal(after.recentQuizzes[0]!.submitted, true); assert.equal(after.recentQuizzes[0]!.correctCount, 3);
  assert.doesNotMatch(JSON.stringify(after), /correctOption|explanation|selectedAnswer|contentHash/);
  assert.deepEqual(h.store.get('authoring'), saved); assert.deepEqual(h.evidence.listSources('authoring'), sources);
  assert.deepEqual(h.authoring.learningContext({ courseId: 'empty' }), empty);
  assert.throws(() => h.authoring.learningContext({ courseId: 'missing' }), code('not-found'));
  const cancelled = new AbortController(); cancelled.abort();
  assert.throws(() => h.authoring.learningContext({ courseId: 'authoring' }, cancelled.signal), { name: 'AbortError' });
  await h.store.update('authoring', s => ({ ...s, course: { ...s.course, status: 'archived' } }));
  assert.equal(state().stage, 'archived');
  await assert.rejects(h.authoring.publishQuiz(drafts.quiz), code('conflict'));
});

test('processing and failed imports never advertise authoring readiness; manual recovery refreshes context', async t => {
  const h = await openAuthoring(); t.after(() => h.close());
  await h.service.createCourse({ id: 'pending', title: 'Pending', subject: 'calculus', dailyMinutes: 60 });
  let release!: () => void; const gate = new Promise<void>(r => { release = r; });
  let fail = true;
  const parser = { id: 'text-v1' as const, async parse(input: Parameters<TextParser['parse']>[0], signal: AbortSignal) {
    await gate; if (fail) throw new Error('Parser failed'); return new TextParser().parse(input, signal);
  } };
  const evidence = new EvidenceService(h.service, new SqliteEvidenceStore(':memory:'), parser); t.after(() => evidence.close());
  const authoring = new CourseAuthoringService(h.service, evidence);
  const read = () => authoring.learningContext({ courseId: 'pending' });
  const input = { filename: 'lecture.md', mimeType: 'text/markdown', text: '# Continuity\nCourse definition.' };
  const pending = evidence.importText('pending', input);
  const rejected = assert.rejects(pending);
  assert.equal(read().stage, 'needs_material'); assert.equal(read().sources[0]!.status, 'processing');
  release(); await rejected;
  assert.equal(read().stage, 'needs_material'); assert.equal(read().sources[0]!.status, 'failed');
  fail = false; await evidence.importText('pending', input);
  assert.equal(read().stage, 'needs_outline'); assert.equal(read().sources[0]!.status, 'ready');
  assert.equal(read().sources.length, 1);
});

test('grounded outline initializes unknown learner state and canonical references; retry is semantic and immutable', async t => {
  const h = await fixture(t); const d = h.drafts.outline;
  const a = await h.authoring.publishOutline(d);
  assert.equal(a.concepts.length, 2);
  assert.ok(a.concepts.every(c => c.sourceRefs.length && c.sourceRefs.every(r => r.startsWith('learning-evidence://authoring/'))));
  const state = h.authoring.learningContext({ courseId: d.courseId });
  assert.equal(state.currentPlan, null); assert.equal(state.recentPlanRevision, null);
  assert.ok(state.conceptStates.every(c => c.status === 'unknown' && c.evidenceCount === 0 && c.mastery === 0.5));
  const retry = structuredClone(d); retry.concepts.reverse(); retry.concepts.forEach(c => c.evidenceChunkIds.reverse()); retry.concepts[0]!.name += '  ';
  assert.deepEqual(await h.authoring.publishOutline(retry), a);
  const changed = structuredClone(d); changed.concepts[0]!.name = 'changed';
  await assert.rejects(h.authoring.publishOutline(changed), code('conflict'));
  assert.deepEqual(h.authoring.learningContext({ courseId: d.courseId }), state);
});
test('outline rejects unknown course, missing or foreign evidence, duplicate IDs, unknown/self prerequisite and cycles', async t => {
  const h = await fixture(t); const { outline } = h.drafts;
  await h.service.createCourse({ id: 'other', title: 'Other', subject: 'calculus', dailyMinutes: 60 });
  await assert.rejects(h.authoring.publishOutline({ ...outline, courseId: 'missing' }), code('not-found'));
  await assert.rejects(h.authoring.publishOutline({ ...outline, courseId: 'other' }), code('not-found'));
  const invalid = [
    (d: typeof outline) => { d.concepts[0]!.evidenceChunkIds = []; },
    (d: typeof outline) => { d.concepts[1]!.id = d.concepts[0]!.id; },
    (d: typeof outline) => { d.concepts[0]!.prerequisiteIds = ['missing']; },
    (d: typeof outline) => { d.concepts[0]!.prerequisiteIds = ['continuity']; },
    (d: typeof outline) => { d.concepts[0]!.prerequisiteIds = ['uniform-continuity']; },
    (d: typeof outline) => { d.concepts[0]!.name = '  '; },
  ];
  for (const mutate of invalid) { const d = structuredClone(outline); mutate(d); await assert.rejects(h.authoring.publishOutline(d), code('invalid-input')); }
  await assert.rejects(h.authoring.publishOutline({ ...outline, mastery: 1 }), code('invalid-input'));
  await assert.rejects(h.authoring.publishOutline({ ...outline, concepts: [{ ...outline.concepts[0], sourceRefs: ['fake'] }] }), code('invalid-input'));
  assert.equal(h.service.getState('authoring').concepts.length, 0);
});
test('initial plan requires outline, validates concept refs/day count/budget and makes only one pending v1', async t => {
  const h = await fixture(t); const { outline, plan } = h.drafts;
  await assert.rejects(h.authoring.publishInitialPlan(plan), code('conflict'));
  await h.authoring.publishOutline(outline);
  for (const mutate of [
    (d: typeof plan) => { d.days[0]!.tasks[0]!.conceptIds = ['foreign']; },
    (d: typeof plan) => { d.days[0]!.tasks[0]!.estimatedMinutes = 61; },
    (d: typeof plan) => { d.days[1]!.day = 3; },
    (d: typeof plan) => { d.days[0]!.tasks = []; },
    (d: typeof plan) => { d.startsOn = '2026-02-30'; },
    (d: typeof plan) => { d.days[0]!.tasks[0]!.questionCount = 3; },
  ]) { const d = structuredClone(plan); mutate(d); await assert.rejects(h.authoring.publishInitialPlan(d), code('invalid-input')); }
  await assert.rejects(h.authoring.publishInitialPlan({ ...plan, version: 2 }), code('invalid-input'));
  const a = await h.authoring.publishInitialPlan(plan); assert.equal(a.plan.version, 1);
  assert.ok(a.plan.days.flatMap(d => d.tasks).every(t => t.status === 'pending'));
  assert.equal(new Set(a.plan.days.flatMap(d => d.tasks.map(t => t.id))).size, 6);
  assert.deepEqual(await h.authoring.publishInitialPlan(plan), a);
  await assert.rejects(h.authoring.publishInitialPlan({ ...plan, startsOn: '2026-09-13' }), code('conflict'));
});
test('quiz requires plan, validates evidence/concepts/keys/duplicates and never returns answer key', async t => {
  const h = await fixture(t); const { outline, plan, quiz } = h.drafts;
  await h.authoring.publishOutline(outline);
  await assert.rejects(h.authoring.publishQuiz(quiz), code('conflict'));
  await h.authoring.publishInitialPlan(plan);
  for (const mutate of [
    (d: typeof quiz) => { d.items[0]!.conceptIds = ['foreign']; },
    (d: typeof quiz) => { d.items[0]!.evidenceChunkIds = []; },
    (d: typeof quiz) => { d.items[0]!.correctOption = 2; },
    (d: typeof quiz) => { d.items.push(d.items[0]!); },
    (d: typeof quiz) => { d.items[0]!.options = ['same', ' same ']; },
  ]) { const d = structuredClone(quiz); mutate(d); await assert.rejects(h.authoring.publishQuiz(d), code('invalid-input')); }
  const foreign = await authoringDrafts(h, 'foreign');
  const wrong = structuredClone(quiz); wrong.items[0]!.evidenceChunkIds = foreign.quiz.items[0]!.evidenceChunkIds;
  await assert.rejects(h.authoring.publishQuiz(wrong), code('not-found'));
  const a = await h.authoring.publishQuiz(quiz);
  assert.equal(a.quiz.items.length, 5); assert.equal(new Set(a.quiz.items.map(i => i.id)).size, 5);
  assert.doesNotMatch(JSON.stringify(a), /correctOption|explanation/);
  assert.deepEqual(h.service.getQuiz('authoring', a.quiz.id), a.quiz);
  assert.deepEqual(await h.authoring.publishQuiz(quiz), a);
  assert.equal(h.store.get('authoring')!.quizzes.length, 1);
});
test('source → outline → 3-day plan → 5-question quiz → two wrong → weak/review/v2 survives reopen and publish retries', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'authoring-restart-')); t.after(() => rm(dir, { recursive: true, force: true }));
  let h = await openAuthoring(join(dir, 'state.db'), join(dir, 'evidence.db')); t.after(() => h.close());
  const drafts = await authoringDrafts(h);
  const outline = await h.authoring.publishOutline(drafts.outline);
  const plan = await h.authoring.publishInitialPlan(drafts.plan);
  const { quiz } = await h.authoring.publishQuiz(drafts.quiz);
  const input = { submissionId: 'student-1', quizId: quiz.id, answers: quiz.items.map((i, n) => ({ itemId: i.id, selectedOption: n < 3 ? 0 : 1 })) };
  const result = await h.service.submit('authoring', input);
  assert.equal(result.attempts.length, 5); assert.equal(result.receipt.planVersion, 2);
  const context = h.authoring.learningContext({ courseId: 'authoring' });
  assert.equal(context.conceptStates.find(c => c.conceptId === 'uniform-continuity')!.status, 'weak');
  assert.equal(context.reviewQueue[0]!.conceptId, 'uniform-continuity');
  assert.deepEqual(context.recentPlanRevision!.evidenceAttemptIds, result.attempts.slice(3).map(a => a.id));
  const tasks = context.currentPlan!.days[1]!.tasks;
  assert.equal(tasks.find(t => t.type === 'review')!.estimatedMinutes, 20);
  assert.equal(tasks.find(t => t.type === 'practice')!.questionCount, 3);
  assert.ok(tasks.reduce((n, t) => n + t.estimatedMinutes, 0) <= 60);
  assert.doesNotMatch(JSON.stringify(context), /correctOption|explanation|selectedAnswer/);
  await h.close(); h = await openAuthoring(join(dir, 'state.db'), join(dir, 'evidence.db'));
  assert.deepEqual(h.authoring.learningContext({ courseId: 'authoring' }), context);
  assert.deepEqual(await h.authoring.publishOutline(drafts.outline), outline);
  assert.deepEqual(await h.authoring.publishInitialPlan(drafts.plan), plan);
  assert.deepEqual((await h.authoring.publishQuiz(drafts.quiz)).quiz, quiz);
  assert.deepEqual(await h.service.submit('authoring', input), result);
  assert.equal(h.store.get('authoring')!.plans.length, 2);
  assert.equal(h.store.get('authoring')!.quizzes.length, 1);
});
test('concurrent identical publications serialize without duplicate state; distinct outline/plan conflict', async t => {
  const h = await fixture(t); const { outline, plan, quiz } = h.drafts;
  const outlines = await Promise.all([h.authoring.publishOutline(outline), h.authoring.publishOutline(outline)]);
  assert.deepEqual(outlines[0], outlines[1]);
  const plans = await Promise.all([h.authoring.publishInitialPlan(plan), h.authoring.publishInitialPlan(plan)]);
  assert.deepEqual(plans[0], plans[1]);
  const quizzes = await Promise.all([h.authoring.publishQuiz(quiz), h.authoring.publishQuiz(quiz)]);
  assert.deepEqual(quizzes[0], quizzes[1]); assert.equal(h.store.get('authoring')!.quizzes.length, 1);
});
test('archived course rejects every publish; cancelled proposals leave no partial state', async t => {
  const h = await fixture(t); const { outline, plan, quiz } = h.drafts;
  const controller = new AbortController(); controller.abort();
  await assert.rejects(h.authoring.publishOutline(outline, controller.signal), { name: 'AbortError' });
  await assert.rejects(h.authoring.publishInitialPlan(plan, controller.signal), { name: 'AbortError' });
  await assert.rejects(h.authoring.publishQuiz(quiz, controller.signal), { name: 'AbortError' });
  const during = new AbortController(); const pending = h.authoring.publishOutline(outline, during.signal); during.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  assert.equal(h.service.getState('authoring').concepts.length, 0);
  await h.store.update('authoring', s => { s.course.status = 'archived'; return s; });
  for (const publish of [() => h.authoring.publishOutline(outline), () => h.authoring.publishInitialPlan(plan), () => h.authoring.publishQuiz(quiz)]) await assert.rejects(publish(), code('conflict'));
});
test('failed authoring storage write is atomic and the same draft succeeds after lock release', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'authoring-lock-')); t.after(() => rm(dir, { recursive: true, force: true }));
  const h = await openAuthoring(join(dir, 'state.db')); t.after(() => h.close());
  const { outline } = await authoringDrafts(h); const lock = new DatabaseSync(join(dir, 'state.db')); t.after(() => lock.close());
  lock.exec('BEGIN IMMEDIATE');
  await assert.rejects(h.authoring.publishOutline(outline));
  assert.equal(h.service.getState('authoring').concepts.length, 0);
  lock.exec('ROLLBACK'); await h.authoring.publishOutline(outline);
  assert.equal(h.service.getState('authoring').conceptStates.length, 2);
});

test('cancellation while an initial-plan publish waits in the real writer queue prevents the commit', async t => {
  const h = await fixture(t); await h.authoring.publishOutline(h.drafts.outline);
  const controller = new AbortController();
  const preceding = h.store.update('authoring', s => { controller.abort(); return s; });
  const queued = h.authoring.publishInitialPlan(h.drafts.plan, controller.signal);
  await preceding; await assert.rejects(queued, { name: 'AbortError' });
  assert.equal(h.service.getState('authoring').plan, null);
  await h.authoring.publishInitialPlan(h.drafts.plan);
  assert.equal(h.service.getState('authoring').plan!.version, 1);
});
test('concurrent different initial outlines and plans admit exactly one winner', async t => {
  const h = await fixture(t); const changed = structuredClone(h.drafts.outline); changed.concepts[0]!.name = '另一个名称';
  const outlines = await Promise.allSettled([h.authoring.publishOutline(h.drafts.outline), h.authoring.publishOutline(changed)]);
  assert.equal(outlines.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(outlines.some(r => r.status === 'rejected' && code('conflict')(r.reason)));
  const plans = await Promise.allSettled([h.authoring.publishInitialPlan(h.drafts.plan), h.authoring.publishInitialPlan({ ...h.drafts.plan, startsOn: '2026-09-13' })]);
  assert.equal(plans.filter(r => r.status === 'fulfilled').length, 1);
  assert.ok(plans.some(r => r.status === 'rejected' && code('conflict')(r.reason)));
  assert.equal(h.store.get('authoring')!.plans.length, 1);
});
test('quiz publication at capacity still acknowledges identical retries and rejects new content atomically', async t => {
  const h = await fixture(t); await h.authoring.publishOutline(h.drafts.outline); await h.authoring.publishInitialPlan(h.drafts.plan);
  const original = await h.authoring.publishQuiz(h.drafts.quiz);
  // Seed the already-supported durable capacity to isolate the boundary, not 200 redundant tool calls.
  await h.store.update('authoring', s => {
    const q = s.quizzes[0]!; s.quizzes.push(...Array.from({ length: 199 }, (_, n) => ({ ...structuredClone(q), id: `capacity-${n}` }))); return s;
  });
  assert.deepEqual(await h.authoring.publishQuiz(h.drafts.quiz), original);
  await assert.rejects(h.authoring.publishQuiz({ ...h.drafts.quiz, purpose: 'next practice' }), code('limit-exceeded'));
  assert.equal(h.store.get('authoring')!.quizzes.length, 200);
});
test('authoring validates up to 100 distinct references with bounded reads, including eight full chunks per concept', async t => {
  const h = await fixture(t);
  await h.evidence.importText('authoring', { filename: 'large.md', mimeType: 'text/markdown',
    text: Array.from({ length: 104 }, (_, i) => `## Topic ${i}\n${'x'.repeat(3800)}\n`).join('') });
  const chunkIds = Array.from({ length: 104 }, (_, i) => h.evidence.search({ courseId: 'authoring', query: `Topic ${i}` }).results
    .find(r => r.locator.kind === 'text' && r.locator.section === `Topic ${i}`)!.chunkId);
  const draft = { courseId: 'authoring', concepts: Array.from({ length: 13 }, (_, n) => ({ id: `concept-${n}`, name: `Topic ${n}`, aliases: [], prerequisiteIds: [],
    evidenceChunkIds: chunkIds.slice(n * 8, n * 8 + 8) })) };
  await assert.rejects(h.authoring.publishOutline(draft), code('limit-exceeded'));
  assert.equal(h.service.getState('authoring').concepts.length, 0);
  draft.concepts[12]!.evidenceChunkIds = chunkIds.slice(96, 100);
  const published = await h.authoring.publishOutline(draft);
  assert.equal(published.concepts.reduce((n, c) => n + c.sourceRefs.length, 0), 100);
  assert.ok(published.concepts.some(c => c.sourceRefs.length === 8));
});
test('plan supports one through fourteen days and fifty tasks per day without relaxing quiz and task bounds', async t => {
  const h = await fixture(t); await h.authoring.publishOutline(h.drafts.outline);
  const plan = structuredClone(h.drafts.plan); plan.days = Array.from({ length: 14 }, (_, n) => ({ day: n + 1,
    tasks: Array.from({ length: 50 }, () => ({ type: 'review', conceptIds: ['continuity'], estimatedMinutes: 1, reason: '复习' })) }));
  const tooMany = structuredClone(plan); tooMany.days[0]!.tasks.push(tooMany.days[0]!.tasks[0]!);
  await assert.rejects(h.authoring.publishInitialPlan(tooMany), code('invalid-input'));
  assert.equal((await h.authoring.publishInitialPlan(plan)).plan.days.length, 14);
  const tooManyQuiz = structuredClone(h.drafts.quiz); tooManyQuiz.items = Array.from({ length: 21 }, (_, n) => ({ ...tooManyQuiz.items[0]!, prompt: `Question ${n}` }));
  await assert.rejects(h.authoring.publishQuiz(tooManyQuiz), code('invalid-input'));
  const other = await authoringDrafts(h, 'single-day'); await h.authoring.publishOutline(other.outline);
  assert.equal((await h.authoring.publishInitialPlan({ ...other.plan, days: other.plan.days.slice(0, 1) })).plan.days.length, 1);
});
