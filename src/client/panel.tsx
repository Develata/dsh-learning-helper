import { useEffect, useState } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { Course, Navigation, Section, Source, StudentDashboard } from './types.js';
import { sessionPath, request } from './api.js';
import { useResource } from './resource.js';
import { InitializeProject, Sources } from './course.js';
import { Loading, Failure } from './common.js';
import { PlanView, ProgressView } from './plan.js';
import { QuizView } from './quiz.js';
import { quickPrompt } from './model.js';
import type { TaskSessionsProps } from './task-sessions.js';
import type { ProjectManifest } from '../workspace/context.js';
const sections: [Section, string][] = [['course', '资料'], ['plan', '计划'], ['progress', '进度'], ['quiz', '练习']];
type PanelProps = { sessionId: string | null; navigation: Navigation; revision: number; inputActions: InputActions; inputDraft: string; fullscreen: boolean } & TaskSessionsProps;
export function LearningPanel(props: PanelProps) {
  return <div className="lh-panel" aria-label="Learning Helper"><header className="lh-panel-heading"><div><div className="lh-eyebrow">LEARNING HELPER</div><h1>让每次练习都有回响</h1></div></header>
    {!props.fullscreen && <p className="lh-compact-hint lh-muted">分栏空间较小时，可用右上角“全屏”专注学习。</p>}
    {props.sessionId ? <ActiveProject key={props.sessionId} {...props} sessionId={props.sessionId}/> : <p className="lh-empty" role="status">请先选择或创建 Workspace，并打开其中的会话。</p>}
  </div>;
}
function ActiveProject({ sessionId, ...props }: Omit<PanelProps, 'sessionId'> & { sessionId: string }) {
  const [reload, setReload] = useState(0);
  const state = useResource(sessionId, signal => request<{ project: ProjectManifest | null }>(sessionPath(sessionId) + '/project', signal), reload + props.revision);
  if (state.status === 'loading') return <Loading/>;
  if (state.status === 'error') return <Failure message={state.error} retry={() => setReload(n => n + 1)}/>;
  if (!state.data.project) return <InitializeProject sessionId={sessionId} onCreated={() => setReload(n => n + 1)}/>;
  const manifest = state.data.project;
  const course = { id: manifest.projectId, ...manifest };
  const navigation = !props.navigation.projectId || props.navigation.projectId === manifest.projectId ? props.navigation : {};
  return <><h2>{manifest.title}</h2><ProjectWorkspace key={manifest.projectId} {...props} navigation={navigation} sessionId={sessionId} course={course}/></>;
}
function ProjectWorkspace({ sessionId, course, navigation, revision, inputActions, inputDraft, taskSessions, taskState }: { sessionId: string; course: Pick<Course, 'id' | 'title' | 'subject' | 'dailyMinutes' | 'examAt'>; navigation: Navigation; revision: number; inputActions: InputActions; inputDraft: string } & TaskSessionsProps) {
  const [section, setSection] = useState<Section>(navigation.section ?? 'plan');
  const [quizId, setQuizId] = useState(navigation.quizId ?? ''); const [refresh, setRefresh] = useState(0); const [notice, setNotice] = useState('');
  useEffect(() => { if (!inputDraft.trim()) setNotice(''); }, [inputDraft]);
  const state = useResource(sessionId, async signal => {
    const [dashboard, sources] = await Promise.all([request<StudentDashboard>(sessionPath(sessionId) + '/dashboard', signal),
      request<{ sources: Source[] }>(sessionPath(sessionId) + '/sources', signal)]);
    return { dashboard, sources: sources.sources };
  }, refresh + revision);
  useEffect(() => { if (navigation.section) setSection(navigation.section); if (navigation.quizId) setQuizId(navigation.quizId); }, [navigation.section, navigation.quizId, revision]);
  function ask(action: 'plan' | 'quiz' | 'review') {
    if (inputDraft.trim()) { setNotice('输入框已有草稿，请先发送或清空，再使用快捷动作。'); return; }
    inputActions.setDraft(quickPrompt(course, action)); setNotice('请求已填入聊天输入框，请确认并发送。');
  }
  if (state.status === 'error') return <Failure message={state.error} retry={() => setRefresh(n => n + 1)}/>;
  if (state.status === 'loading') return <Loading/>;
  const { dashboard: data, sources } = state.data;
  return <div className="lh-workspace">
    <div className="lh-course-meta"><span>{course.subject}</span><span>{course.dailyMinutes} 分钟/天</span>{course.examAt && <span>考试 {new Date(course.examAt).toLocaleDateString('zh-CN')}</span>}</div>
    <div className="lh-tabs" role="group" aria-label="学习区域">{sections.map(([id, label]) => <Button key={id} aria-pressed={section === id} onClick={() => setSection(id)}>{label}</Button>)}
      <Button aria-label="刷新学习项目" onClick={() => setRefresh(n => n + 1)}>刷新</Button></div>
    {state.refreshing && <Loading text="正在刷新…"/>}
    {data.project.status === 'active' && <div className="lh-agent-actions">
      <Button variant="outline" disabled={!sources.some(s => s.status === 'ready')} onClick={() => ask(data.currentPlan ? 'quiz' : 'plan')}>{data.currentPlan ? '让 Agent 生成 5 题练习' : '让 Agent 生成 3 天计划'}</Button>
      {data.concepts.some(c => c.status === 'weak') && <Button onClick={() => ask('review')}>复习薄弱点</Button>}
      <p className="lh-muted">上方快捷动作填入当前聊天框，确认后发送。计划任务中的“新会话”会直接开始学习。</p>{notice && <p role="status">{notice}</p>}
    </div>}
    {section === 'course' && <Sources sessionId={sessionId} sources={sources} reload={() => setRefresh(n => n + 1)}/>}
    {section === 'plan' && <PlanView data={data} taskSessions={taskSessions} taskState={taskState}/>}
    {section === 'progress' && <ProgressView data={data}/>}
    {section === 'quiz' && (quizId ? <QuizView key={quizId} sessionId={sessionId} projectId={course.id} quizId={quizId} concepts={data.concepts}
      back={() => setQuizId('')} onSubmitted={() => setRefresh(n => n + 1)}/> : <section aria-label="练习列表"><h2>练习与回顾</h2>
        {!data.quizzes.length ? <p className="lh-empty">还没有练习。计划就绪后，让 Agent 从课程资料生成题目。</p> : <ul className="lh-quiz-list">{data.quizzes.map(q => <li key={q.id}>
          <div className="lh-row"><strong>{q.purpose}</strong><Tag tone={q.submitted ? 'success' : 'neutral'}>{q.submitted ? `已完成 · ${q.correctCount}/${q.itemCount}` : `${q.itemCount} 题 · 未作答`}</Tag></div>
          <Button variant="outline" onClick={() => setQuizId(q.id)}>{q.submitted ? '查看反馈' : '开始练习'}</Button>
        </li>)}</ul>}
      </section>)}
  </div>;
}
