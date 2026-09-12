import { setImmediate } from 'node:timers/promises';
import { courseOutlineDraftSchema, studyPlanDraftSchema, quizDraftSchema, learningContextArgsSchema, MAX_AUTHORING_CHUNKS } from '../domain/authoring.js';
import { LearningError } from '../domain/errors.js';
import type { LearningService } from './learning.js';
import { EvidenceService, validate } from './evidence.js';

/** Orchestrates read-only evidence validation and narrow LearningService commits; never owns a DB. */
export class CourseAuthoringService {
  constructor(private readonly learning: LearningService, private readonly evidence: EvidenceService) {}
  learningContext(input: unknown, signal = new AbortController().signal) {
    signal.throwIfAborted();
    const { courseId } = validate(learningContextArgsSchema, input);
    const { revisions, plan, ...state } = this.learning.getState(courseId);
    return { ...state, currentPlan: plan, recentPlanRevision: revisions.at(-1) ?? null };
  }
  private async resolve(courseId: string, ids: string[], signal: AbortSignal): Promise<Map<string, string>> {
    signal.throwIfAborted();
    if (this.learning.getCourse(courseId).status !== 'active') throw new LearningError('conflict', 'Course is archived');
    const unique = [...new Set(ids)];
    if (unique.length > MAX_AUTHORING_CHUNKS) throw new LearningError('limit-exceeded', 'Publish references at most 100 distinct chunks');
    const refs = new Map<string, string>();
    for (const id of unique) {
      // Yield between bounded reads so tool timeout/cancellation can stop a large proposal.
      await setImmediate(undefined, { signal });
      const chunk = this.evidence.read({ courseId, chunkIds: [id] }, signal).chunks[0]!;
      refs.set(id, chunk.canonicalRef);
    }
    return refs;
  }
  async publishOutline(input: unknown, signal = new AbortController().signal) {
    signal.throwIfAborted();
    const draft = validate(courseOutlineDraftSchema, input);
    const refs = await this.resolve(draft.courseId, draft.concepts.flatMap(c => c.evidenceChunkIds), signal);
    const concepts = draft.concepts.map(({ evidenceChunkIds, ...c }) => ({ ...c, courseId: draft.courseId,
      sourceRefs: evidenceChunkIds.map(id => refs.get(id)!).sort() }));
    return this.learning.publishOutline(draft.courseId, concepts, signal);
  }
  async publishInitialPlan(input: unknown, signal = new AbortController().signal) {
    signal.throwIfAborted();
    const draft = validate(studyPlanDraftSchema, input);
    return this.learning.publishInitialPlan(draft, signal);
  }
  async publishQuiz(input: unknown, signal = new AbortController().signal) {
    signal.throwIfAborted();
    const draft = validate(quizDraftSchema, input);
    const refs = await this.resolve(draft.courseId, draft.items.flatMap(i => i.evidenceChunkIds), signal);
    const items = draft.items.map(({ evidenceChunkIds, ...item }, i) => ({ ...item, id: `item-${i + 1}`,
      sourceRefs: evidenceChunkIds.map(id => refs.get(id)!).sort() }));
    return this.learning.publishQuiz({ courseId: draft.courseId, purpose: draft.purpose, items }, signal);
  }
}
