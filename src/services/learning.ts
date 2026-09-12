import { z } from 'zod';
import { submissionSchema, idSchema, createCourseSchema } from '../domain/model.js';
import { learningStateSchema } from './state-schema.js';
import type { LearningAggregate, Submission, Receipt, Course } from '../domain/model.js';
import { LearningError } from '../domain/errors.js';
import { adaptPlan, updateConcept } from '../policy/adaptation.js';

/** Atomic aggregate persistence; providers serialize transforms and commit before resolving. */
export interface LearningStore {
  listCourses(): Course[];
  getCourse(courseId: string): Course | undefined;
  get(courseId: string): LearningAggregate | undefined;
  create(state: LearningAggregate): Promise<void>;
  update(courseId: string, transform: (current: LearningAggregate) => LearningAggregate): Promise<LearningAggregate>;
}
function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) throw new LearningError('invalid-input', result.error.issues[0]?.message ?? 'Invalid input');
  return result.data;
}
const normalized = (s: Submission) => JSON.stringify({ quizId: s.quizId, answers: [...s.answers].sort((a, b) => a.itemId.localeCompare(b.itemId)) });

/** The only learning-state mutation owner. Clock is supplied once per submission by the Host. */
export class LearningService {
  constructor(private readonly store: LearningStore, private readonly clock: () => Date = () => new Date()) {}
  async create(input: unknown): Promise<void> { await this.store.create(parse(learningStateSchema, input)); }
  async createCourse(input: unknown): Promise<Course> {
    const course: Course = { ...parse(createCourseSchema, input), createdAt: this.clock().toISOString(), status: 'active' };
    await this.create({ schemaVersion: 1, course, concepts: [], quizzes: [], attempts: [], conceptStates: [],
      reviewQueue: [], plans: [], revisions: [], submissions: [] });
    return structuredClone(course);
  }
  listCourses(): Course[] { return this.store.listCourses(); }
  getCourse(id: string): Course {
    parse(idSchema, id);
    const course = this.store.getCourse(id);
    if (!course) throw new LearningError('not-found', 'Course not found');
    return course;
  }
  private requireCourse(id: string): LearningAggregate {
    parse(idSchema, id);
    const state = this.store.get(id);
    if (!state) throw new LearningError('not-found', 'Course not found');
    return state;
  }
  getState(courseId: string) {
    const s = this.requireCourse(courseId);
    return structuredClone({ course: s.course, concepts: s.concepts, conceptStates: s.conceptStates,
      reviewQueue: s.reviewQueue, plan: s.plans.at(-1) ?? null, revisions: s.revisions });
  }
  getQuiz(courseId: string, quizId: string) {
    const s = this.requireCourse(courseId);
    const q = s.quizzes.find(q => q.id === quizId);
    if (!q) throw new LearningError('not-found', 'Quiz not found');
    return structuredClone({ ...q, items: q.items.map(({ correctOption: _key, explanation: _explanation, ...item }) => item) });
  }
  async submit(courseId: string, input: unknown) {
    parse(idSchema, courseId);
    const submission = parse(submissionSchema, input);
    const now = this.clock().toISOString();
    const state = await this.store.update(courseId, current => {
      const existing = current.submissions.find(s => s.submission.submissionId === submission.submissionId);
      if (existing) {
        if (normalized(existing.submission) !== normalized(submission)) throw new LearningError('conflict', 'Submission identity already used for different answers');
        return current;
      }
      if (current.course.status !== 'active') throw new LearningError('conflict', 'Course is archived');
      if (current.submissions.some(s => s.submission.quizId === submission.quizId)) throw new LearningError('conflict', 'Quiz already submitted; publish a new quiz for further practice');
      const quiz = current.quizzes.find(q => q.id === submission.quizId);
      if (!quiz) throw new LearningError('not-found', 'Quiz not found');
      const initialPlan = current.plans.at(-1);
      if (!initialPlan) throw new LearningError('conflict', 'Publish an initial study plan before practice');
      if (Date.parse(now) < Date.parse(quiz.createdAt) || Date.parse(now) < Date.parse(current.attempts.at(-1)?.submittedAt ?? current.course.createdAt)) throw new LearningError('conflict', 'Host clock moved backwards');
      if (submission.answers.length !== quiz.items.length) throw new LearningError('invalid-input', 'Answer every quiz item exactly once');
      const answers = new Map(submission.answers.map(a => [a.itemId, a.selectedOption]));
      for (const item of quiz.items) {
        const option = answers.get(item.id);
        if (option === undefined || option >= item.options.length) throw new LearningError('invalid-input', 'Unknown item or option');
      }
      if (current.attempts.length + quiz.items.length > 4000) throw new LearningError('limit-exceeded', 'Course evidence capacity reached');
      const next = structuredClone(current);
      const weak = new Set(current.conceptStates.filter(s => s.status === 'weak').map(s => s.conceptId));
      const attemptIds: string[] = [];
      for (const item of quiz.items) {
        const selectedAnswer = answers.get(item.id)!;
        const correct = selectedAnswer === item.correctOption;
        const attempt = { id: `${submission.submissionId}:${item.id}`, submissionId: submission.submissionId,
          courseId, quizId: quiz.id, itemId: item.id, conceptIds: [...item.conceptIds], selectedAnswer,
          correct, score: correct ? 1 as const : 0 as const, submittedAt: now };
        next.attempts.push(attempt); attemptIds.push(attempt.id);
        for (const conceptId of item.conceptIds) {
          const index = next.conceptStates.findIndex(s => s.conceptId === conceptId);
          next.conceptStates[index] = updateConcept(next.conceptStates[index]!, attempt, item.difficulty);
        }
      }
      adaptPlan(next, weak, now);
      const receipt: Receipt = { submission: structuredClone(submission), attemptIds, submittedAt: now, planVersion: next.plans.at(-1)?.version ?? initialPlan.version };
      if (next.revisions.length > current.revisions.length) receipt.revision = next.revisions.at(-1)!;
      next.submissions.push(receipt);
      return learningStateSchema.parse(next);
    });
    const receipt = state.submissions.find(s => s.submission.submissionId === submission.submissionId)!;
    const attempts = state.attempts.filter(a => a.submissionId === submission.submissionId);
    const quiz = state.quizzes.find(q => q.id === submission.quizId)!;
    return structuredClone({ receipt, attempts, feedback: quiz.items.map(item => ({
      itemId: item.id, correctOption: item.correctOption, explanation: item.explanation,
    })) });
  }
}
