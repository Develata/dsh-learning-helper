import type { CourseAuthoringService } from '../services/authoring.js';
import type { Concept } from '../domain/model.js';
import { renderEvidence } from './shared.js';

type LearningContext = ReturnType<CourseAuthoringService['learningContext']>;
const conceptContext = ({ id, name, aliases, prerequisiteIds }: Concept) => ({ id, name, aliases, prerequisiteIds });

/** Model-facing projection only; canonical values remain complete for programmatic consumers.
 * Whitelist fields so future domain fields cannot silently inflate the prompt or leak keys.
 */
export function renderLearningContext(_args: unknown, value: LearningContext) {
  return renderEvidence(null, {
    course: value.course, stage: value.stage, sources: value.sources,
    concepts: value.concepts.map(conceptContext),
    conceptStates: value.conceptStates.map(({ conceptId, status, evidenceCount }) => ({ conceptId, status, evidenceCount })),
    reviewQueue: value.reviewQueue.map(({ conceptId, reason, dueAt }) => ({ conceptId, reason, ...(dueAt === undefined ? {} : { dueAt }) })),
    currentPlan: value.currentPlan,
    recentPlanRevision: value.recentPlanRevision === null ? null : {
      oldVersion: value.recentPlanRevision.oldVersion, newVersion: value.recentPlanRevision.newVersion,
      reason: value.recentPlanRevision.reason, createdAt: value.recentPlanRevision.createdAt,
    },
    quizCount: value.quizCount, unsubmittedQuizCount: value.unsubmittedQuizCount, recentQuizzes: value.recentQuizzes,
  });
}

export function renderOutline(_args: unknown, value: { courseId: string; concepts: Concept[] }) {
  return renderEvidence(null, { courseId: value.courseId, concepts: value.concepts.map(conceptContext) });
}
