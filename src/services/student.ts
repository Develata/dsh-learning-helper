import type { LearningAggregate, Quiz } from '../domain/model.js';

/** Student read models are derived from one committed learning snapshot, never persisted. */
export function quizSummaries(state: LearningAggregate) {
  const receipts = new Map(state.submissions.map(r => [r.submission.quizId, r]));
  const scores = new Map<string, number>();
  for (const a of state.attempts) scores.set(a.quizId, (scores.get(a.quizId) ?? 0) + Number(a.correct));
  return [...state.quizzes].reverse().map(q => {
    const receipt = receipts.get(q.id);
    return { id: q.id, purpose: q.purpose, createdAt: q.createdAt, itemCount: q.items.length,
      submitted: receipt !== undefined, submittedAt: receipt?.submittedAt ?? null,
      correctCount: receipt ? scores.get(q.id) ?? 0 : null };
  });
}

export function quizResult(state: LearningAggregate, quiz: Quiz) {
  const receipt = state.submissions.find(r => r.submission.quizId === quiz.id);
  if (!receipt) return null;
  const attempts = new Map(state.attempts.filter(a => a.quizId === quiz.id).map(a => [a.itemId, a]));
  return { quizId: quiz.id, submittedAt: receipt.submittedAt,
    correctCount: [...attempts.values()].filter(a => a.correct).length, itemCount: quiz.items.length,
    items: quiz.items.map(item => {
      const a = attempts.get(item.id)!;
      return { itemId: item.id, selectedOption: a.selectedAnswer, correct: a.correct,
        correctOption: item.correctOption, explanation: item.explanation };
    }) };
}

export function studentDashboard(state: LearningAggregate) {
  const revision = state.revisions.at(-1) ?? null;
  const attempts = new Map(state.attempts.map(a => [a.id, a]));
  const quizzes = new Map(state.quizzes.map(q => [q.id, q]));
  const states = new Map(state.conceptStates.map(s => [s.conceptId, s]));
  return structuredClone({ course: state.course,
    concepts: state.concepts.map(c => ({ id: c.id, name: c.name, prerequisiteIds: c.prerequisiteIds,
      status: states.get(c.id)!.status, evidenceCount: states.get(c.id)!.evidenceCount })),
    currentPlan: state.plans.at(-1) ?? null, recentPlanRevision: revision,
    recentRevisionEvidence: (revision?.evidenceAttemptIds ?? []).map(id => {
      const a = attempts.get(id)!;
      const item = quizzes.get(a.quizId)!.items.find(i => i.id === a.itemId)!;
      return { attemptId: a.id, quizId: a.quizId, itemId: a.itemId, conceptIds: a.conceptIds,
        prompt: item.prompt, selectedOption: item.options[a.selectedAnswer]!, correct: a.correct };
    }), quizzes: quizSummaries(state) });
}

export type StudentDashboard = ReturnType<typeof studentDashboard>;
export type QuizSummary = ReturnType<typeof quizSummaries>[number];
export type QuizResult = NonNullable<ReturnType<typeof quizResult>>;
export type PublicQuiz = Omit<Quiz, 'items'> & { items: Omit<Quiz['items'][number], 'correctOption' | 'explanation'>[] };
