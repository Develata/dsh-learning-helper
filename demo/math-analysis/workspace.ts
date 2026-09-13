import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceProjects } from '../../src/workspace/projects.js';
import { WorkspaceResolver } from '../../src/workspace/context.js';
import { groundedDrafts } from '../../tests/authoring-helpers.js';

const root = mkdtempSync(join(tmpdir(), 'lh-demo-workspace-'));
const resolver = new WorkspaceResolver(() => [{ path: root, sessionIds: ['demo'] }]);
const projects = new WorkspaceProjects(resolver); const signal = new AbortController().signal;
try {
  await projects.initialize('demo', { title: '数学分析', subject: 'Analysis', dailyMinutes: 60 });
  await projects.use('demo', signal, async p => {
    await p.evidence.importText(p.projectId, { filename: 'lecture-03.md', mimeType: 'text/markdown', text: readFileSync(new URL('./lecture-03.md', import.meta.url), 'utf8') });
    const drafts = groundedDrafts(p.evidence, p.projectId); drafts.plan.startsOn = new Date().toISOString().slice(0, 10);
    await p.authoring.publishOutline(drafts.outline); await p.authoring.publishInitialPlan(drafts.plan);
    const { quiz } = await p.authoring.publishQuiz(drafts.quiz);
    assert.doesNotMatch(JSON.stringify(quiz), /correctOption|explanation/);
    await p.learning.submit(p.projectId, { submissionId: 'demo-submission', quizId: quiz.id, answers: quiz.items.map((q, i) => ({ itemId: q.id, selectedOption: i < 3 ? 0 : 1 })) });
    const dashboard = p.learning.getDashboard(p.projectId);
    assert.equal(dashboard.currentPlan?.version, 2);
    assert.ok(dashboard.concepts.some(c => c.id === 'uniform-continuity' && c.status === 'weak'));
    console.log(JSON.stringify({ deterministic: true, semanticLlmRun: false, boundary: 'Workspace', flow: 'Source → Outline → Plan → Quiz → 3/5 → Weak → v2', plan: dashboard.currentPlan?.days[1], revision: dashboard.recentPlanRevision }, null, 2));
  });
} finally { await projects.close(); rmSync(root, { recursive: true, force: true }); }
