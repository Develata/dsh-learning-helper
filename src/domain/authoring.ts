import { z } from 'zod';
import { idSchema, MAX_TASKS_PER_DAY } from './model.js';
import { chunkIdSchema } from './evidence.js';

const text = z.string().trim().min(1).max(4000).refine(s => s.isWellFormed() && !s.includes('\0'), 'invalid text');
const unique = (xs: string[]) => new Set(xs).size === xs.length;
const conceptIds = z.array(idSchema).min(1).max(16).refine(unique, 'duplicate concept ids').transform(xs => xs.sort());
const evidenceChunkIds = z.array(chunkIdSchema).min(1).max(8).refine(unique, 'duplicate evidence ids').transform(xs => xs.sort());
export const MAX_AUTHORING_CHUNKS = 100;
export const learningContextArgsSchema = z.strictObject({ courseId: idSchema });
export const courseOutlineDraftSchema = z.strictObject({
  courseId: idSchema,
  concepts: z.array(z.strictObject({
    id: idSchema, name: text, aliases: z.array(text).max(20).refine(unique, 'duplicate aliases').transform(xs => xs.sort()),
    prerequisiteIds: z.array(idSchema).max(20).refine(unique, 'duplicate prerequisites').transform(xs => xs.sort()), evidenceChunkIds,
  })).min(1).max(100),
}).superRefine((draft, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const nodes = new Map(draft.concepts.map(c => [c.id, c]));
  if (nodes.size !== draft.concepts.length) { fail('duplicate concept ids'); return; }
  const indegree = new Map(draft.concepts.map(c => [c.id, c.prerequisiteIds.length]));
  const dependents = new Map(draft.concepts.map(c => [c.id, [] as string[]]));
  for (const c of draft.concepts) for (const id of c.prerequisiteIds) {
    if (!nodes.has(id) || id === c.id) { fail('unknown or self prerequisite'); return; }
    dependents.get(id)!.push(c.id);
  }
  const queue = draft.concepts.filter(c => !c.prerequisiteIds.length).map(c => c.id);
  for (let i = 0; i < queue.length; i++) for (const id of dependents.get(queue[i]!)!) {
    const n = indegree.get(id)! - 1; indegree.set(id, n); if (n === 0) queue.push(id);
  }
  if (queue.length !== nodes.size) fail('prerequisite cycle');
}).transform(draft => ({ ...draft, concepts: draft.concepts.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) }));

const taskDraftSchema = z.strictObject({
  type: z.enum(['learn', 'review', 'practice']), conceptIds,
  estimatedMinutes: z.number().int().min(1).max(240), reason: text,
  questionCount: z.number().int().min(1).max(20).optional(),
}).refine(t => t.questionCount === undefined || t.type === 'practice', 'questionCount requires practice');
export const studyPlanDraftSchema = z.strictObject({
  courseId: idSchema, startsOn: z.iso.date(),
  days: z.array(z.strictObject({ day: z.number().int().min(1).max(14),
    tasks: z.array(taskDraftSchema).min(1).max(MAX_TASKS_PER_DAY) })).min(1).max(14),
}).refine(p => p.days.every((d, i) => d.day === i + 1), 'days must be contiguous from 1');

export const quizDraftSchema = z.strictObject({
  courseId: idSchema, purpose: text,
  items: z.array(z.strictObject({
    prompt: text, options: z.array(text).min(2).max(8).refine(unique, 'duplicate options'),
    correctOption: z.number().int().nonnegative(), explanation: text,
    conceptIds, evidenceChunkIds, difficulty: z.enum(['easy', 'medium', 'hard']),
  }).refine(i => i.correctOption < i.options.length, 'invalid answer key')).min(1).max(20),
}).refine(q => unique(q.items.map(i => i.prompt.replace(/\s+/g, ' '))), 'duplicate quiz prompt');

export type CourseOutlineDraft = z.output<typeof courseOutlineDraftSchema>;
export type StudyPlanDraft = z.output<typeof studyPlanDraftSchema>;
export type QuizDraft = z.output<typeof quizDraftSchema>;
