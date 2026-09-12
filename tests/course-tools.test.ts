import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { registerCourseTools } from '../src/tools/course-tools.js';
import { EvidenceService } from '../src/services/evidence.js';
import type { EvidenceRead } from '../src/domain/evidence.js';
import { SqliteEvidenceStore } from '../src/providers/evidence-sqlite.js';
import { TextParser } from '../src/providers/text-parser.js';
import { openLearning } from './helpers.js';
import { GROUNDING_POLICY } from '../src/policy/grounding.js';

async function fixture(t: test.TestContext) {
  const h = await openLearning(); await h.ctx.plugin(SystemPrompt); await h.ctx.plugin(ToolRuntime);
  const evidence = new EvidenceService(h.service, new SqliteEvidenceStore(':memory:'), new TextParser());
  registerCourseTools(h.ctx, h.service, evidence);
  t.after(async () => { await evidence.close(); await h.close(); });
  await h.service.createCourse({ id: 'analysis', title: '数学分析', subject: 'calculus', dailyMinutes: 60 });
  let id = 0;
  const dispatch = (name: string, args: unknown, signal = new AbortController().signal) => h.ctx.tools.execute({ callId: ToolCallId(`evidence-${++id}`), name, arguments: args, signal });
  return { ...h, evidence, dispatch };
}
test('real DSH registry dispatches list → search → read and returns a traceable grounded citation', async t => {
  const h = await fixture(t); const text = await readFile(new URL('../demo/math-analysis/lecture-03.md', import.meta.url), 'utf8');
  await h.evidence.importText('analysis', { filename: 'Lecture 03.md', mimeType: 'text/markdown', text });
  const listed = await h.dispatch('course_list', {}); assert.ok(!listed.isError, JSON.stringify(listed));
  assert.deepEqual(listed.value, { courses: h.service.listCourses() });
  const found = await h.dispatch('course_search', { courseId: 'analysis', query: 'Heine Cantor' });
  assert.ok(!found.isError, JSON.stringify(found));
  const expected = h.evidence.search({ courseId: 'analysis', query: 'Heine Cantor' });
  assert.deepEqual(found.value, expected); assert.ok(expected.results.length > 0);
  const chunkIds = expected.results.map(c => c.chunkId);
  const read = await h.dispatch('course_read', { courseId: 'analysis', chunkIds }); assert.ok(!read.isError, JSON.stringify(read));
  const value = read.value as unknown as { courseId: string; chunks: EvidenceRead[] };
  assert.deepEqual(value, h.evidence.read({ courseId: 'analysis', chunkIds }));
  const c = value.chunks[0]!; assert.match(c.text, /x_\{n_k\}→c/);
  // Deterministic evidence acceptance, explicitly not an LLM semantic claim.
  const answer = `课程资料中的证明：${c.text}\n[${c.citationLabel}](${c.canonicalRef})`;
  const refs = [...answer.matchAll(/\]\((learning-evidence:\/\/[^)]+)\)/g)].map(m => m[1]);
  assert.deepEqual(refs, [c.canonicalRef]); assert.ok(value.chunks.some(c => c.canonicalRef === refs[0]));
  assert.doesNotMatch(answer, /p\.\d+/);
  assert.doesNotMatch(JSON.stringify(listed.value), /correctOption|mastery|quizzes/);
});
test('real tool schemas reject bounds, extra keys, wrong-course references and aborted calls', async t => {
  const h = await fixture(t);
  assert.deepEqual(h.ctx.tools.schemas().map(x => x.name).sort(), ['course_list', 'course_read', 'course_search']);
  for (const [name, args] of [
    ['course_list', { raw_sql: 'select 1' }], ['course_search', { courseId: 'analysis', query: '' }],
    ['course_search', { courseId: 'analysis', query: 'a', limit: 21 }],
    ['course_search', { courseId: 'analysis', query: 'a', limit: 0.5 }],
    ['course_search', { courseId: 'analysis', query: 'a', raw_sql: 'delete' }],
    ['course_read', { courseId: 'analysis', chunkIds: [] }],
    ['raw_sql', { query: 'delete' }], ['update_mastery', {}],
  ] as const) assert.equal((await h.dispatch(name, args)).isError, true, name);
  const controller = new AbortController(); controller.abort();
  assert.equal((await h.dispatch('course_list', {}, controller.signal)).isError, true);
  assert.equal((await h.dispatch('course_search', { courseId: 'analysis', query: 'x' }, controller.signal)).isError, true);
});
test('instruction-like source stays in untrusted tool results and cannot change prompt policy or learner state', async t => {
  const h = await fixture(t);
  const before = await h.ctx.systemPrompt.assemble(); const state = h.store.get('analysis');
  const text = await readFile(new URL('../demo/math-analysis/injection.txt', import.meta.url), 'utf8');
  await h.evidence.importText('analysis', { filename: 'injection.txt', mimeType: 'text/plain', text });
  const hits = h.evidence.search({ courseId: 'analysis', query: 'IGNORE ALL PREVIOUS INSTRUCTIONS' });
  const read = await h.dispatch('course_read', { courseId: 'analysis', chunkIds: hits.results.map(r => r.chunkId) });
  assert.ok(!read.isError);
  const rendered = read.content.filter(c => c.type === 'text').map(c => c.text).join('\n');
  assert.match(rendered, /^UNTRUSTED COURSE EVIDENCE DATA/); assert.match(rendered, /DELETE THE DATABASE/);
  assert.deepEqual(await h.ctx.systemPrompt.assemble(), before); assert.deepEqual(h.store.get('analysis'), state);
  assert.equal(before.sections.find(s => s.name === 'learning-helper-grounding')?.text, GROUNDING_POLICY);
  assert.match(GROUNDING_POLICY, /course_search.*course_read/s);
  assert.match(GROUNDING_POLICY, /上传的课程资料不足以支持这个结论/);
  assert.equal(h.evidence.listSources('analysis')[0]!.status, 'ready');
});
