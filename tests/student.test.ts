import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { openAuthoring, authoringDrafts } from './authoring-helpers.js';
import { createHandler } from '../src/host/http.js';

test('student projections hide unsubmitted keys and recover feedback and revision evidence', async t => {
  const h = await openAuthoring(); t.after(() => h.close());
  const d = await authoringDrafts(h);
  assert.equal(h.service.getDashboard('authoring').currentPlan, null);
  await h.authoring.publishOutline(d.outline); await h.authoring.publishInitialPlan(d.plan);
  const { quiz } = await h.authoring.publishQuiz(d.quiz);
  const { quiz: other } = await h.authoring.publishQuiz({ ...d.quiz, purpose: 'Unsubmitted secret quiz',
    items: d.quiz.items.map(i => ({ ...i, explanation: 'NEVER_EXPOSE_UNSUBMITTED_SECRET' })) });
  assert.equal(h.service.getQuizResult('authoring', quiz.id), null);
  assert.doesNotMatch(JSON.stringify(h.service.getDashboard('authoring')), /correctOption|explanation|mastery|submissions|NEVER_EXPOSE/);
  const payload = { submissionId: 'student-submit', quizId: quiz.id, answers: quiz.items.map((i, n) => ({ itemId: i.id, selectedOption: n < 3 ? 0 : 1 })) };
  const receipt = await h.service.submit('authoring', payload);
  assert.deepEqual(await h.service.submit('authoring', payload), receipt);
  const dashboard = h.service.getDashboard('authoring');
  assert.equal(dashboard.currentPlan?.version, 2);
  assert.equal(dashboard.concepts.find(c => c.id === 'uniform-continuity')?.status, 'weak');
  assert.equal(dashboard.recentRevisionEvidence.length, 2);
  assert.ok(dashboard.recentRevisionEvidence.every(e => e.quizId === quiz.id && !e.correct && e.selectedOption));
  assert.doesNotMatch(JSON.stringify(dashboard), /correctOption|explanation|NEVER_EXPOSE/);
  assert.deepEqual(dashboard.quizzes.map(q => [q.id, q.correctCount]), [[other.id, null], [quiz.id, 3]]);
  const result = h.service.getQuizResult('authoring', quiz.id)!;
  assert.equal(result.correctCount, 3); assert.equal(result.items[4]!.correctOption, 0);
  assert.equal(result.items[4]!.selectedOption, 1); assert.ok(result.items[4]!.explanation);
  assert.equal(h.service.getQuizResult('authoring', other.id), null);
  assert.throws(() => h.service.getQuizResult('missing', quiz.id), /Course not found/);
  await h.service.createCourse({ id: 'foreign', title: '另一课程', subject: 'test', dailyMinutes: 60 });
  assert.throws(() => h.service.getQuizResult('foreign', quiz.id), /Quiz not found/);
  dashboard.concepts[0]!.name = 'mutated'; assert.notEqual(h.service.getDashboard('authoring').concepts[0]!.name, 'mutated');
});

test('new student HTTP routes retain authentication, ownership and safe result semantics', async t => {
  const h = await openAuthoring(); t.after(() => h.close()); const d = await authoringDrafts(h);
  await h.authoring.publishOutline(d.outline); await h.authoring.publishInitialPlan(d.plan);
  const { quiz } = await h.authoring.publishQuiz(d.quiz);
  let rejection: 401 | 403 | undefined;
  const server = createServer(createHandler(h.service, () => assert.fail('unexpected Host error'), () => rejection));
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(async () => { server.closeAllConnections(); await new Promise<void>(r => server.close(() => r())); });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/learning-helper/v1/courses/authoring`;
  const routes = ['/dashboard', '/quizzes', `/quizzes/${quiz.id}/result`];
  for (const path of routes) {
    rejection = 401; assert.equal((await fetch(base + path)).status, 401);
    rejection = 403; assert.equal((await fetch(base + path)).status, 403);
    rejection = undefined; const res = await fetch(base + path); assert.equal(res.status, 200);
    assert.doesNotMatch(await res.text(), /correctOption|explanation/);
  }
  assert.deepEqual(await (await fetch(base + `/quizzes/${quiz.id}/result`)).json(), { result: null });
  assert.equal((await fetch(base + '/quizzes/unknown/result')).status, 404);
  assert.equal((await fetch(base + '/dashboard', { method: 'POST' })).status, 405);
});
