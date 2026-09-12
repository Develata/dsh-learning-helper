import { readFile } from 'node:fs/promises';
import { openLearning } from './helpers.js';
import { EvidenceService } from '../src/services/evidence.js';
import { CourseAuthoringService } from '../src/services/authoring.js';
import { SqliteEvidenceStore } from '../src/providers/evidence-sqlite.js';
import { TextParser } from '../src/providers/text-parser.js';
import type { CourseOutlineDraft, StudyPlanDraft, QuizDraft } from '../src/domain/authoring.js';

export async function openAuthoring(statePath = ':memory:', evidencePath = ':memory:') {
  const h = await openLearning(statePath);
  const evidence = new EvidenceService(h.service, new SqliteEvidenceStore(evidencePath), new TextParser());
  const authoring = new CourseAuthoringService(h.service, evidence);
  return { ...h, evidence, authoring, async close() { await evidence.close(); await h.close(); } };
}
export async function authoringDrafts(h: Awaited<ReturnType<typeof openAuthoring>>, courseId = 'authoring') {
  await h.service.createCourse({ id: courseId, title: '数学分析', subject: 'calculus', dailyMinutes: 60 });
  await h.evidence.importText(courseId, { filename: 'Lecture 03.md', mimeType: 'text/markdown',
    text: await readFile(new URL('../demo/math-analysis/lecture-03.md', import.meta.url), 'utf8') });
  const ids = (query: string) => h.evidence.search({ courseId, query }).results.map(r => r.chunkId);
  const continuity = ids('Continuity 连续性'); const uniform = ids('一致连续');
  const outline: CourseOutlineDraft = { courseId, concepts: [
    { id: 'continuity', name: 'Continuity', aliases: ['连续性'], prerequisiteIds: [], evidenceChunkIds: continuity },
    { id: 'uniform-continuity', name: 'Uniform Continuity', aliases: ['一致连续'], prerequisiteIds: ['continuity'], evidenceChunkIds: uniform },
  ] };
  const plan: StudyPlanDraft = { courseId, startsOn: '2026-09-12', days: [1, 2, 3].map(day => ({ day, tasks: [
    { type: 'learn', conceptIds: [day === 1 ? 'continuity' : 'uniform-continuity'], estimatedMinutes: 40, reason: '按先修顺序阅读课程定义与证明。' },
    { type: 'practice', conceptIds: ['continuity', 'uniform-continuity'], estimatedMinutes: 20, questionCount: 5, reason: '用课程题目检查理解。' },
  ] })) };
  const quiz: QuizDraft = { courseId, purpose: 'Day 1 concept check', items: [
    { prompt: '函数在 a 连续的条件是什么？', options: ['极限等于 f(a)', '极限无需存在'], explanation: '课程将 a 处连续定义为极限等于函数值。' },
    { prompt: '若 x_n 趋于 a 且 f 在 a 连续，则？', options: ['f(x_n) 趋于 f(a)', 'f(x_n) 必定发散'], explanation: '讲义给出了连续性的序列刻画。' },
    { prompt: '连续性定义涉及哪个值？', options: ['f(a)', '任意无关常数'], explanation: '极限应等于该点函数值。' },
    { prompt: '一致连续的 δ 能否依赖所选的点？', options: ['不能', '可以'], explanation: '一致连续要求对所有点使用统一的 δ。' },
    { prompt: 'Heine-Cantor 定理的假设是什么？', options: ['闭区间上连续', '只在开区间上连续'], explanation: '闭区间与连续性给出一致连续，讲义含 1/x 反例。' },
  ].map((i, n) => ({ ...i, correctOption: 0, conceptIds: [n < 3 ? 'continuity' : 'uniform-continuity'],
    evidenceChunkIds: n < 3 ? continuity : uniform, difficulty: 'medium' })) };
  return { outline, plan, quiz };
}
