import { Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { StudentDashboard } from './types.js';
import { conceptNames, taskLabel, statusRank } from './model.js';
import { Status } from './common.js';
export function PlanDays({ plan, concepts }: { plan: NonNullable<StudentDashboard['currentPlan']>; concepts: StudentDashboard['concepts'] }) {
  return <div className="lh-days">{plan.days.map(day => <section className="lh-day" key={day.day}>
    <header className="lh-row"><h3>Day {day.day}</h3><span className="lh-muted">{day.tasks.reduce((n, t) => n + t.estimatedMinutes, 0)} 分钟</span></header>
    <ul>{day.tasks.map(task => <li key={task.id} className={task.type === 'review' ? 'lh-targeted' : ''}>
      <div className="lh-task-label">{taskLabel(task)}{task.status === 'done' ? ' · 已完成' : ''}</div>
      <div>{conceptNames(task.conceptIds, concepts)}</div><p className="lh-muted">{task.reason}</p>
    </li>)}</ul>
  </section>)}</div>;
}
export function PlanView({ data }: { data: StudentDashboard }) {
  const plan = data.currentPlan; const revision = data.recentPlanRevision;
  if (!plan) return <div className="lh-empty"><h3>从课程资料开始</h3><p>上传讲义后，让 Agent 建立知识点与学习计划。学习时间将按你的每日预算安排。</p></div>;
  return <section aria-label="学习计划"><header className="lh-row"><h2>当前计划 <span className="lh-muted">· v{plan.version}</span></h2><Tag tone="neutral">{plan.days.length} 天</Tag></header>
    {revision && <section className="lh-revision" aria-label="为什么计划改变">
      <div className="lh-eyebrow">WHY THIS PLAN CHANGED</div><h3>昨天的错题，改变今天的计划</h3>
      <p>计划 v{revision.oldVersion} → v{revision.newVersion}</p><p>{revision.reason}</p>
      <details><summary>{data.recentRevisionEvidence.length} 条错题证据</summary><ol>{data.recentRevisionEvidence.map(e => <li key={e.attemptId}>
        <strong>{conceptNames(e.conceptIds, data.concepts)}</strong><p>{e.prompt}</p><p className="lh-muted">你的选择：{e.selectedOption} · 答错</p>
      </li>)}</ol></details>
    </section>}
    <p className="lh-muted">开始日期 {plan.startsOn} · 每日最多 {data.course.dailyMinutes} 分钟</p>
    <PlanDays plan={plan} concepts={data.concepts}/>
  </section>;
}
export function ProgressView({ data }: { data: StudentDashboard }) {
  return <section aria-label="知识点进度"><h2>把注意力留给薄弱处</h2><p className="lh-muted">状态来自实际作答，随练习更新。</p>
    {!data.concepts.length ? <p className="lh-empty">尚无知识点。请先让 Agent 根据资料建立课程结构。</p> :
      <ul className="lh-progress">{[...data.concepts].sort((a, b) => statusRank[a.status] - statusRank[b.status]).map(c => <li key={c.id}>
        <div className="lh-row"><strong>{c.name}</strong><Status status={c.status}/></div><span className="lh-muted">{c.evidenceCount} 次作答证据</span>
      </li>)}</ul>}
  </section>;
}
