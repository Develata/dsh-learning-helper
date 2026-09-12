import assert from 'node:assert/strict';
import SystemPrompt from '@deepseek-ai/dsh-system-prompt';
import ToolRuntime from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { registerCourseTools } from '../../src/tools/course-tools.js';
import { registerLearningTools } from '../../src/tools/learning-tools.js';
import { openAuthoring, authoringDrafts } from '../../tests/authoring-helpers.js';

const h = await openAuthoring();
try {
  const drafts = await authoringDrafts(h);
  await h.ctx.plugin(SystemPrompt); await h.ctx.plugin(ToolRuntime);
  registerCourseTools(h.ctx, h.service, h.evidence); registerLearningTools(h.ctx, h.authoring);
  const calls: string[] = [];
  const dispatch = async (name: string, args: unknown) => {
    calls.push(name);
    const result = await h.ctx.tools.execute({ callId: ToolCallId(`demo-${calls.length}`), name, arguments: args, signal: new AbortController().signal });
    assert.ok(!result.isError, JSON.stringify(result)); return result.value;
  };
  await dispatch('course_search', { courseId: 'authoring', query: '一致连续' });
  const chunkIds = [...new Set(drafts.outline.concepts.flatMap(c => c.evidenceChunkIds))];
  await dispatch('course_read', { courseId: 'authoring', chunkIds });
  await dispatch('course_outline_publish', drafts.outline);
  await dispatch('study_plan_publish', drafts.plan);
  const published = await dispatch('quiz_publish', drafts.quiz);
  assert.doesNotMatch(JSON.stringify(published), /correctOption|explanation/);
  const quiz = h.store.get('authoring')!.quizzes[0]!;
  const result = await h.service.submit('authoring', { submissionId: 'demo-authoring', quizId: quiz.id,
    answers: quiz.items.map((q, n) => ({ itemId: q.id, selectedOption: n < 3 ? 0 : 1 })) });
  await dispatch('learning_state_get', { courseId: 'authoring' });
  const state = h.authoring.learningContext({ courseId: 'authoring' });
  assert.equal(state.conceptStates.find(c => c.conceptId === 'uniform-continuity')!.status, 'weak');
  assert.equal(state.currentPlan!.version, 2);
  assert.equal(state.currentPlan!.days[1]!.tasks[0]!.estimatedMinutes, 20);
  assert.equal(state.currentPlan!.days[1]!.tasks[1]!.questionCount, 3);
  console.log(JSON.stringify({ deterministic: true, semanticLlmRun: false, toolCalls: calls,
    source: h.evidence.listSources('authoring')[0]!.id, quizId: quiz.id, attempts: result.attempts.length,
    learnerState: state.conceptStates.map(c => ({ concept: c.conceptId, status: c.status })),
    reviewQueue: state.reviewQueue, revision: state.recentPlanRevision, day2: state.currentPlan!.days[1] }, null, 2));
} finally { await h.close(); }
