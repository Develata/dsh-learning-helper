import { LearningError } from '../domain/errors.js';
import { MAX_TASKS_PER_DAY } from '../domain/model.js';
import type { Attempt, ConceptState, LearningAggregate, QuizItem } from '../domain/model.js';

export function initialConceptState(courseId: string, conceptId: string): ConceptState {
  return { courseId, conceptId, mastery: 0.5, evidenceCount: 0, recentCorrect: 0,
    recentWrong: 0, recentOutcomes: [], status: 'unknown' };
}

/** Pure monotone score update with a two-error entry / two-success exit threshold. */
export function updateConcept(previous: ConceptState, attempt: Attempt, difficulty: QuizItem['difficulty']): ConceptState {
  const outcomes = [...previous.recentOutcomes, attempt.correct].slice(-5);
  const repeatedWrong = outcomes.length >= 2 && outcomes.slice(-2).every(x => !x);
  const recovered = outcomes.length >= 2 && outcomes.slice(-2).every(Boolean);
  const weight = { easy: 0.1, medium: 0.15, hard: 0.2 }[difficulty];
  const mastery = Math.min(1, Math.max(0, previous.mastery + (attempt.correct ? weight : -weight)));
  const count = previous.evidenceCount + 1;
  const weak = repeatedWrong || (previous.status === 'weak' && !recovered);
  const status = weak ? 'weak' : count >= 4 && mastery >= 0.8 ? 'strong' : count >= 2 && mastery >= 0.6 ? 'okay' : 'learning';
  return { ...previous, mastery, status, evidenceCount: count, recentOutcomes: outcomes,
    recentCorrect: outcomes.filter(Boolean).length, recentWrong: outcomes.filter(x => !x).length,
    lastAttemptAt: attempt.submittedAt };
}

/** Derive review evidence and revise only a future day, preserving completed work and the budget. */
export function adaptPlan(state: LearningAggregate, previouslyWeak: Set<string>, now: string): void {
  state.reviewQueue = state.conceptStates.filter(s => s.status === 'weak').map(s => {
    const evidence = state.attempts.filter(t => t.conceptIds.includes(s.conceptId) && !t.correct).slice(-5);
    const concept = state.concepts.find(c => c.id === s.conceptId)!;
    // Keep full names in Concept; at most eight reviews fit in a 240-minute day.
    // This excerpt bounds both each reason and their combined revision reason.
    const chars = [...concept.name];
    const label = chars.length <= 160 ? concept.name : `${chars.slice(0, 160).join('')}…`;
    return { conceptId: s.conceptId, priority: s.recentWrong, reason: `${label} 最近重复答错，安排定向复习。`,
      evidenceAttemptIds: evidence.map(t => t.id), dueAt: now };
  });
  const newlyWeak = state.reviewQueue.filter(r => !previouslyWeak.has(r.conceptId));
  const old = state.plans.at(-1);
  if (!old) return;
  const today = Math.floor((Date.parse(now.slice(0, 10)) - Date.parse(old.startsOn)) / 86_400_000) + 1;
  // Pre-plan submissions cannot pull remediation into Day 1; no next day means queue only.
  const nextDay = old.days.find(d => d.day > Math.max(1, today));
  if (!nextDay || newlyWeak.length === 0) return;
  const done = nextDay.tasks.filter(t => t.status === 'done');
  let budget = state.course.dailyMinutes - done.reduce((n, t) => n + t.estimatedMinutes, 0);
  const selected = newlyWeak.slice(0, Math.min(Math.floor(budget / 30), Math.floor((MAX_TASKS_PER_DAY - done.length) / 2)));
  if (selected.length === 0) return;
  if (state.revisions.length >= 100) throw new LearningError('limit-exceeded', 'Plan revision capacity reached');
  const next = structuredClone(old);
  next.version++; next.createdAt = now;
  const day = next.days.find(d => d.day === nextDay.day)!;
  day.tasks = structuredClone(done);
  const usedIds = new Set(old.days.flatMap(d => d.tasks.map(t => t.id)));
  const taskId = (kind: 'review' | 'practice') => {
    const prefix = `v${next.version}-${kind}-`;
    let index = 0;
    while (usedIds.has(`${prefix}${index}`)) index++;
    const id = `${prefix}${index}`; usedIds.add(id); return id;
  };
  for (const review of selected) {
    day.tasks.push(
      { id: taskId('review'), type: 'review', conceptIds: [review.conceptId], estimatedMinutes: 20, reason: review.reason, status: 'pending' },
      { id: taskId('practice'), type: 'practice', conceptIds: [review.conceptId], estimatedMinutes: 10, questionCount: 3, reason: review.reason, status: 'pending' },
    );
    budget -= 30;
  }
  for (const task of nextDay.tasks.filter(t => t.status === 'pending')) {
    if (budget <= 0 || day.tasks.length >= MAX_TASKS_PER_DAY) break;
    // Keep practice items whole; shrinking their time would imply an unjustified pace.
    if (task.questionCount !== undefined && task.estimatedMinutes > budget) continue;
    const minutes = Math.min(task.estimatedMinutes, budget);
    day.tasks.push({ ...structuredClone(task), estimatedMinutes: minutes }); budget -= minutes;
  }
  const reason = selected.map(r => r.reason).join(' ');
  state.plans.push(next);
  state.revisions.push({ oldVersion: old.version, newVersion: next.version, reason,
    evidenceAttemptIds: [...new Set(selected.flatMap(r => r.evidenceAttemptIds))], createdAt: now });
}
