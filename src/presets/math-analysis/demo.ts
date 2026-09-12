import { aggregateSchema } from '../../domain/model.js';
import type { LearningAggregate, Submission } from '../../domain/model.js';

/** Authored fixture only; not a generated quiz and not evidence-grounded course content. */
export function demoCourse(now = '2026-09-12T09:00:00.000Z'): LearningAggregate {
  const names = [['sequence-limits', 'Sequence Limits'], ['function-limits', 'Function Limits'],
    ['continuity', 'Continuity'], ['uniform-continuity', 'Uniform Continuity']] as const;
  const questions = [
    { id: 'q1', prompt: '数列 1/n 的极限是什么？', options: ['0', '1', '不存在'], correctOption: 0,
      explanation: '任给 ε > 0，取 N > 1/ε，则 n > N 时 1/n < ε。', conceptIds: ['sequence-limits'] },
    { id: 'q2', prompt: 'x 趋于 0 时，函数 x² 的极限是什么？', options: ['1', '0', '不存在'], correctOption: 1,
      explanation: '取 δ = √ε 即得 |x| < δ 时 |x²| < ε。', conceptIds: ['function-limits'] },
    { id: 'q3', prompt: '函数 f 在点 a 连续要求什么？', options: ['f(a) 存在即可', '极限存在即可', 'lim f(x) = f(a)'], correctOption: 2,
      explanation: '在定义域内趋近 a 时，函数极限必须等于该点函数值。', conceptIds: ['continuity'] },
    { id: 'q4', prompt: '一致连续定义中的 δ 可以依赖什么？', options: ['ε，但不依赖所选点', '每一个所选点', '只依赖 x 的符号'], correctOption: 0,
      explanation: '任给 ε > 0，存在对定义域所有点同时适用的 δ > 0。', conceptIds: ['uniform-continuity'] },
    { id: 'q5', prompt: '闭区间 [a,b] 上连续的实值函数是否必然一致连续？', options: ['不一定', '必然', '只有可导时才成立'], correctOption: 1,
      explanation: '成立：闭区间的紧致性使局部连续控制可提升为统一控制（Heine–Cantor）。', conceptIds: ['uniform-continuity'] },
  ];
  return aggregateSchema.parse({ schemaVersion: 1,
    course: { id: 'demo-calculus', title: '3-Day Adaptive Study Loop', subject: '数学分析', createdAt: now, dailyMinutes: 60, status: 'active' },
    concepts: names.map(([id, name], i) => ({ id, name, courseId: 'demo-calculus', aliases: [], prerequisiteIds: i ? [names[i - 1]![0]] : [], sourceRefs: [] })),
    quizzes: [{ id: 'day-1', courseId: 'demo-calculus', purpose: 'Day 1 authored fixture', createdAt: now,
      items: questions.map(q => ({ ...q, sourceRefs: [], difficulty: 'medium' })) }],
    attempts: [], conceptStates: names.map(([id]) => ({ courseId: 'demo-calculus', conceptId: id, mastery: 0.5,
      evidenceCount: 0, recentCorrect: 0, recentWrong: 0, recentOutcomes: [], status: 'unknown' })),
    reviewQueue: [], plans: [{ id: 'three-day-plan', courseId: 'demo-calculus', version: 1, createdAt: now,
      startsOn: now.slice(0, 10), days: [1, 2, 3].map(day => ({ day, tasks: [{ id: `day-${day}-learn`, type: 'learn',
        conceptIds: [day === 1 ? 'continuity' : 'function-limits'], estimatedMinutes: 60, reason: '初始复习安排', status: 'pending' }] })) }],
    revisions: [], submissions: [],
  });
}
export function demoSubmission(): Submission {
  return { submissionId: 'demo-first-submit', quizId: 'day-1', answers: [0, 1, 2, 1, 0].map((selectedOption, i) => ({ itemId: `q${i + 1}`, selectedOption })) };
}
