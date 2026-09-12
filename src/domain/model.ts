import { z } from 'zod';

export const idSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/);
const timestamp = z.iso.datetime();
const text = z.string().min(1).max(4000);
const ids = z.array(idSchema).min(1).max(16).refine(xs => new Set(xs).size === xs.length, 'duplicate ids');
const sourceRefs = z.array(z.string().min(1).max(300)).max(32);
export const courseSchema = z.strictObject({
  id: idSchema, title: text, subject: text, createdAt: timestamp,
  examAt: timestamp.optional(), dailyMinutes: z.number().int().min(30).max(240),
  status: z.enum(['active', 'archived']),
});
export const conceptSchema = z.strictObject({
  id: idSchema, courseId: idSchema, name: text, aliases: z.array(text).max(20),
  prerequisiteIds: z.array(idSchema).max(20), sourceRefs,
});
export const quizItemSchema = z.strictObject({
  id: idSchema, prompt: text, options: z.array(text).min(2).max(8),
  correctOption: z.number().int().nonnegative(), explanation: text,
  conceptIds: ids, sourceRefs, difficulty: z.enum(['easy', 'medium', 'hard']),
}).refine(item => item.correctOption < item.options.length, 'invalid answer key');
export const quizSchema = z.strictObject({
  id: idSchema, courseId: idSchema, purpose: text, createdAt: timestamp,
  items: z.array(quizItemSchema).min(1).max(20),
}).refine(q => new Set(q.items.map(i => i.id)).size === q.items.length, 'duplicate item ids');
export const attemptSchema = z.strictObject({
  id: z.string().min(1).max(170), submissionId: idSchema, courseId: idSchema,
  quizId: idSchema, itemId: idSchema, conceptIds: ids,
  selectedAnswer: z.number().int().nonnegative(), correct: z.boolean(),
  score: z.union([z.literal(0), z.literal(1)]), submittedAt: timestamp,
});
export const conceptStateSchema = z.strictObject({
  courseId: idSchema, conceptId: idSchema, mastery: z.number().min(0).max(1),
  evidenceCount: z.number().int().nonnegative(), recentCorrect: z.number().int().min(0).max(5),
  recentWrong: z.number().int().min(0).max(5), recentOutcomes: z.array(z.boolean()).max(5),
  lastAttemptAt: timestamp.optional(), status: z.enum(['unknown', 'learning', 'weak', 'okay', 'strong']),
});
export const reviewSchema = z.strictObject({
  conceptId: idSchema, priority: z.number().int().positive(), reason: text,
  evidenceAttemptIds: z.array(z.string()).min(2).max(5), dueAt: timestamp.optional(),
});
export const taskSchema = z.strictObject({
  id: idSchema, type: z.enum(['learn', 'review', 'practice']), conceptIds: ids,
  estimatedMinutes: z.number().int().min(1).max(240), reason: text,
  status: z.enum(['pending', 'done']), questionCount: z.number().int().min(1).max(20).optional(),
});
export const studyPlanSchema = z.strictObject({
  id: idSchema, courseId: idSchema, version: z.number().int().positive(), createdAt: timestamp,
  startsOn: z.iso.date(), days: z.array(z.strictObject({ day: z.number().int().min(1).max(14), tasks: z.array(taskSchema).max(50) })).min(1).max(14),
});
export const revisionSchema = z.strictObject({
  oldVersion: z.number().int().positive(), newVersion: z.number().int().positive(),
  reason: text, evidenceAttemptIds: z.array(z.string()).min(2).max(100), createdAt: timestamp,
});
export const submissionSchema = z.strictObject({
  submissionId: idSchema, quizId: idSchema,
  answers: z.array(z.strictObject({ itemId: idSchema, selectedOption: z.number().int().nonnegative() })).min(1).max(20),
}).refine(s => new Set(s.answers.map(a => a.itemId)).size === s.answers.length, 'duplicate answers');
export const receiptSchema = z.strictObject({
  submission: submissionSchema, attemptIds: z.array(z.string()).min(1).max(20),
  submittedAt: timestamp, planVersion: z.number().int().positive(),
  revision: revisionSchema.optional(),
});

export const aggregateSchema = z.strictObject({
  schemaVersion: z.literal(1), course: courseSchema,
  concepts: z.array(conceptSchema).min(1).max(100), quizzes: z.array(quizSchema).max(200),
  attempts: z.array(attemptSchema).max(4000), conceptStates: z.array(conceptStateSchema).max(100),
  reviewQueue: z.array(reviewSchema).max(100), plans: z.array(studyPlanSchema).min(1).max(101),
  revisions: z.array(revisionSchema).max(100), submissions: z.array(receiptSchema).max(200),
}).superRefine((a, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const unique = (values: string[], label: string) => { if (new Set(values).size !== values.length) fail(`duplicate ${label}`); };
  unique(a.concepts.map(c => c.id), 'concept');
  unique(a.quizzes.map(q => q.id), 'quiz');
  unique(a.attempts.map(t => t.id), 'attempt');
  unique(a.submissions.map(s => s.submission.submissionId), 'submission');
  unique(a.submissions.map(s => s.submission.quizId), 'submitted quiz');
  unique(a.conceptStates.map(s => s.conceptId), 'concept state');
  unique(a.reviewQueue.map(r => r.conceptId), 'review');
  const concepts = new Set(a.concepts.map(c => c.id));
  const quizzes = new Map(a.quizzes.map(q => [q.id, q]));
  const attempts = new Map(a.attempts.map(t => [t.id, t]));
  const receipts = new Map(a.submissions.map(s => [s.submission.submissionId, s]));
  const refs = (xs: string[]) => { if (xs.some(id => !concepts.has(id))) fail('unknown concept'); };
  for (const c of a.concepts) { refs(c.prerequisiteIds); if (c.courseId !== a.course.id || c.prerequisiteIds.includes(c.id)) fail('invalid concept owner/prerequisite'); }
  for (const q of a.quizzes) { if (q.courseId !== a.course.id) fail('invalid quiz owner'); for (const i of q.items) refs(i.conceptIds); }
  for (const t of a.attempts) {
    const item = quizzes.get(t.quizId)?.items.find(i => i.id === t.itemId);
    const receipt = receipts.get(t.submissionId);
    if (!item || !receipt || t.courseId !== a.course.id || t.selectedAnswer >= item.options.length
      || t.correct !== (t.selectedAnswer === item.correctOption) || t.score !== Number(t.correct)
      || JSON.stringify(t.conceptIds) !== JSON.stringify(item.conceptIds)
      || !receipt.attemptIds.includes(t.id)) fail('invalid attempt evidence');
  }
  for (const s of a.conceptStates) {
    refs([s.conceptId]);
    const evidence = a.attempts.filter(t => t.conceptIds.includes(s.conceptId));
    const recent = evidence.slice(-5).map(t => t.correct);
    if (s.courseId !== a.course.id || s.evidenceCount !== evidence.length
      || JSON.stringify(recent) !== JSON.stringify(s.recentOutcomes)
      || s.recentCorrect !== recent.filter(Boolean).length || s.recentWrong !== recent.filter(x => !x).length
      || s.lastAttemptAt !== evidence.at(-1)?.submittedAt) fail('invalid concept state evidence');
  }
  if (a.conceptStates.length !== a.concepts.length) fail('missing concept states');
  for (const r of a.reviewQueue) {
    refs([r.conceptId]);
    if (a.conceptStates.find(s => s.conceptId === r.conceptId)?.status !== 'weak'
      || r.evidenceAttemptIds.some(id => !attempts.get(id)?.conceptIds.includes(r.conceptId) || attempts.get(id)?.correct)) fail('invalid review evidence');
  }
  if (a.conceptStates.some(s => s.status === 'weak' && !a.reviewQueue.some(r => r.conceptId === s.conceptId))) fail('weak concept missing review');
  a.plans.forEach((p, i) => {
    if (p.courseId !== a.course.id || p.version !== i + 1 || p.id !== a.plans[0]?.id || p.startsOn !== a.plans[0]?.startsOn) fail('invalid plan identity/version');
    unique(p.days.map(d => String(d.day)), 'plan day');
    unique(p.days.flatMap(d => d.tasks.map(t => t.id)), 'task');
    p.days.forEach((d, j) => {
      if (d.day !== j + 1 || d.tasks.reduce((n, t) => n + t.estimatedMinutes, 0) > a.course.dailyMinutes) fail('invalid day/budget');
      for (const t of d.tasks) refs(t.conceptIds);
    });
  });
  if (a.revisions.length !== a.plans.length - 1) fail('missing plan revision');
  a.revisions.forEach((r, i) => {
    if (r.oldVersion !== i + 1 || r.newVersion !== i + 2 || r.evidenceAttemptIds.some(id => !attempts.has(id))) fail('invalid revision evidence/version');
  });
  for (const s of a.submissions) {
    const q = quizzes.get(s.submission.quizId);
    if (!q || s.attemptIds.length !== q.items.length || s.submission.answers.length !== q.items.length
      || s.planVersion > a.plans.length) { fail('invalid receipt'); continue; }
    unique(s.attemptIds, 'receipt attempt');
    for (const answer of s.submission.answers) {
      const t = s.attemptIds.map(id => attempts.get(id)).find(t => t?.itemId === answer.itemId);
      if (!t || t.quizId !== q.id || t.submissionId !== s.submission.submissionId
        || t.selectedAnswer !== answer.selectedOption || t.submittedAt !== s.submittedAt) fail('invalid receipt answer');
    }
    if (s.revision && JSON.stringify(s.revision) !== JSON.stringify(a.revisions[s.revision.newVersion - 2])) fail('invalid receipt revision');
  }
});

export type Course = z.infer<typeof courseSchema>;
export type Concept = z.infer<typeof conceptSchema>;
export type Quiz = z.infer<typeof quizSchema>;
export type QuizItem = z.infer<typeof quizItemSchema>;
export type Attempt = z.infer<typeof attemptSchema>;
export type ConceptState = z.infer<typeof conceptStateSchema>;
export type ReviewItem = z.infer<typeof reviewSchema>;
export type StudyPlan = z.infer<typeof studyPlanSchema>;
export type PlanRevision = z.infer<typeof revisionSchema>;
export type Submission = z.infer<typeof submissionSchema>;
export type Receipt = z.infer<typeof receiptSchema>;
export type LearningAggregate = z.infer<typeof aggregateSchema>;
