import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import type { CourseAuthoringService } from '../services/authoring.js';
import type { StudyPlan } from '../domain/model.js';
import { requiredString as str, integer as int, course, renderEvidence } from './shared.js';

const strings = { type: 'array', items: { type: 'string' }, required: true } as const;
const conceptProperties = { id: str, name: str, aliases: strings, prerequisiteIds: strings } as const;
const concepts = { type: 'array', required: true, items: { type: 'object', additionalProperties: false,
  properties: { ...conceptProperties, courseId: str, sourceRefs: strings } } } as const;
const taskProperties = { type: { type: 'string', enum: ['learn', 'review', 'practice'], required: true },
  conceptIds: strings, estimatedMinutes: int, reason: str, questionCount: { type: 'integer', description: 'Only for practice: integer 1–20. For learn/review OMIT this field entirely; do not send 0 or null.' } } as const;
const { questionCount: practiceCount, ...studyTaskProperties } = taskProperties;
const taskDraft = { oneOf: [
  { type: 'object', additionalProperties: false, properties: { ...studyTaskProperties, type: { type: 'string', enum: ['learn', 'review'], required: true } } },
  { type: 'object', additionalProperties: false, properties: { ...studyTaskProperties, type: { type: 'string', const: 'practice', required: true }, questionCount: practiceCount } },
] } as const;
const tasks = { type: 'array', required: true, items: { type: 'object', additionalProperties: false,
  properties: { ...taskProperties, id: str, status: { type: 'string', enum: ['pending', 'done'], required: true } } } } as const;
const plan = { type: 'object', additionalProperties: false, properties: {
  id: str, courseId: str, version: int, createdAt: str, startsOn: str,
  days: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: { day: int, tasks } } },
} } as const;
const revision = { type: 'object', additionalProperties: false, properties: {
  oldVersion: int, newVersion: int, reason: str, evidenceAttemptIds: strings, createdAt: str,
} } as const;
const itemProperties = { prompt: str, options: strings, conceptIds: strings,
  difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'], required: true } } as const;
const quiz = { type: 'object', additionalProperties: false, properties: {
  id: str, courseId: str, purpose: str, createdAt: str, items: { type: 'array', required: true,
    items: { type: 'object', additionalProperties: false, properties: { ...itemProperties, id: str, sourceRefs: strings } } },
} } as const;

// Zod's optional fields admit explicit undefined; Harness canonical JSON does not.
function canonicalPlan(p: StudyPlan) {
  return { ...p, days: p.days.map(d => ({ ...d, tasks: d.tasks.map(({ questionCount, ...t }) => ({ ...t,
    ...(questionCount === undefined ? {} : { questionCount }) })) })) };
}

/** Four learning adapters; mutation authority stays in the application service. */
export function registerLearningTools(ctx: Context, authoring: CourseAuthoringService): void {
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'learning_state_get', description: 'Read this course outline, learner status, review queue, current plan and latest automatic revision. No answer keys or raw attempts. Call before authoring to determine the setup stage.',
    parameters: { courseId: str }, output: { schema: { type: 'object', additionalProperties: false, properties: {
      course: { ...course, required: true }, concepts,
      conceptStates: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        courseId: str, conceptId: str, mastery: { type: 'number', required: true }, evidenceCount: int,
        recentCorrect: int, recentWrong: int, recentOutcomes: { type: 'array', items: { type: 'boolean' }, required: true },
        lastAttemptAt: { type: 'string' }, status: { type: 'string', enum: ['unknown', 'learning', 'weak', 'okay', 'strong'], required: true },
      } } },
      reviewQueue: { type: 'array', required: true, items: { type: 'object', additionalProperties: false, properties: {
        conceptId: str, priority: int, reason: str, evidenceAttemptIds: strings, dueAt: { type: 'string' },
      } } },
      currentPlan: { oneOf: [plan, { type: 'null' }], required: true },
      recentPlanRevision: { oneOf: [revision, { type: 'null' }], required: true },
    } }, render: renderEvidence }, isConcurrencySafe: () => true, timeoutMs: 5000,
    async execute(args, exec) {
      const s = authoring.learningContext(args, exec.signal); const { examAt, ...c } = s.course;
      return { ...s, course: { ...c, ...(examAt === undefined ? {} : { examAt }) },
        conceptStates: s.conceptStates.map(({ lastAttemptAt, ...c }) => ({ ...c, ...(lastAttemptAt === undefined ? {} : { lastAttemptAt }) })),
        reviewQueue: s.reviewQueue.map(({ dueAt, ...r }) => ({ ...r, ...(dueAt === undefined ? {} : { dueAt }) })),
        currentPlan: s.currentPlan === null ? null : canonicalPlan(s.currentPlan) };
    }, presentCall: () => ({ card: 'generic', title: '读取学习状态', kind: 'read' }),
  })));
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'course_outline_publish', description: 'Publish the first grounded course outline only when the user requests learning setup/planning. First search/read evidence. 1–100 unique concepts; each needs 1–8 actual chunk IDs; at most 100 distinct chunks total. Prerequisites must form a DAG inside this outline. Same semantic retry returns existing; different second outline conflicts. Never supply mastery or raw sourceRefs.',
    parameters: { courseId: str, concepts: { type: 'array', required: true, items: { type: 'object', additionalProperties: false,
      properties: { ...conceptProperties, evidenceChunkIds: strings } } } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { courseId: str, concepts } }, render: renderEvidence },
    isConcurrencySafe: () => false, timeoutMs: 5000,
    async execute(args, exec) { return authoring.publishOutline(args, exec.signal); },
    presentCall: () => ({ card: 'generic', title: '发布课程概念', kind: 'edit' }),
  })));
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'study_plan_publish', description: 'Publish only the initial study plan after the grounded outline exists and the user requests a plan. startsOn: YYYY-MM-DD; 1–14 contiguous days starting at 1, 1–50 tasks/day, within dailyMinutes. Each task uses known concepts, 1–240 minutes; optional questionCount 1–20 only for practice. Host sets pending/version/IDs/time. Same retry returns v1 even after automatic v2; cannot overwrite adaptation.',
    parameters: { courseId: str, startsOn: str, days: { type: 'array', required: true, items: { type: 'object', additionalProperties: false,
      properties: { day: int, tasks: { type: 'array', required: true, items: taskDraft } } } } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { courseId: str, plan: { ...plan, required: true } } }, render: renderEvidence },
    isConcurrencySafe: () => false, timeoutMs: 5000,
    async execute(args, exec) { const s = await authoring.publishInitialPlan(args, exec.signal); return { ...s, plan: canonicalPlan(s.plan) }; },
    presentCall: () => ({ card: 'generic', title: '发布初始学习计划', kind: 'edit' }),
  })));
  ctx.effect(() => ctx.tools.register(defineTool({
    name: 'quiz_publish', description: 'Publish a user-requested grounded MCQ quiz after outline and initial plan exist. First search/read evidence. 1–20 unique prompts, 2–8 distinct options, 0-based correctOption, explanation, 1–16 known concept IDs, 1–8 actual evidence chunk IDs/item; max 100 distinct chunks total. Same semantic quiz returns existing ID, even after submission. Host grades later; result is public and omits answer key. Arguments contain the generated key in session logs.',
    parameters: { courseId: str, purpose: str, items: { type: 'array', required: true, items: { type: 'object', additionalProperties: false,
      properties: { ...itemProperties, correctOption: int, explanation: str, evidenceChunkIds: strings } } } },
    output: { schema: { type: 'object', additionalProperties: false, properties: { courseId: str, quiz: { ...quiz, required: true } } }, render: renderEvidence },
    isConcurrencySafe: () => false, timeoutMs: 5000,
    async execute(args, exec) { return authoring.publishQuiz(args, exec.signal); },
    presentCall: () => ({ card: 'generic', title: '发布课程练习', kind: 'edit' }),
  })));
}
