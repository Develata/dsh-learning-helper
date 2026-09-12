import { aggregateSchema } from '../domain/model.js';
import { initialConceptState, updateConcept } from '../policy/adaptation.js';

/** The durable boundary composes structural invariants with the actual learning policy.
 * Replay validates derived state; it never repairs or overwrites inconsistent evidence.
 */
export const learningStateSchema = aggregateSchema.superRefine((state, ctx) => {
  const derived = new Map(state.concepts.map(c => [c.id, initialConceptState(state.course.id, c.id)]));
  const items = new Map(state.quizzes.flatMap(q => q.items.map(i => [`${q.id}:${i.id}`, i] as const)));
  for (const attempt of state.attempts) {
    const item = items.get(`${attempt.quizId}:${attempt.itemId}`);
    if (!item) continue; // The structural schema reports dangling references.
    for (const conceptId of attempt.conceptIds) {
      const previous = derived.get(conceptId);
      if (previous) derived.set(conceptId, updateConcept(previous, attempt, item.difficulty));
    }
  }
  state.conceptStates.forEach((actual, index) => {
    const expected = derived.get(actual.conceptId);
    if (expected && (actual.mastery !== expected.mastery || actual.status !== expected.status)) {
      ctx.addIssue({ code: 'custom', path: ['conceptStates', index], message: 'Learner state does not match attempt policy replay' });
    }
  });
});
