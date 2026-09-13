import { useEffect, useId, useState } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { InputActions } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type { Course, Navigation, Section, Source, StudentDashboard } from './types.js';
import { coursePath, request } from './api.js';
import { useResource } from './resource.js';
import { CreateCourse, Sources } from './course.js';
import { Loading, Failure } from './common.js';
import { PlanView, ProgressView } from './plan.js';
import { QuizView } from './quiz.js';
import { quickPrompt } from './model.js';
import type { TaskSessionsProps } from './task-sessions.js';
const sections: [Section, string][] = [['course', '课程'], ['plan', '计划'], ['progress', '进度'], ['quiz', '练习']];
function rememberedCourse() { try { return sessionStorage.getItem('learning-helper:selected-course') ?? ''; } catch { return ''; } }
export function LearningPanel({ navigation, revision, inputActions, inputDraft, fullscreen, taskSessions, taskState }: { navigation: Navigation; revision: number; inputActions: InputActions; inputDraft: string; fullscreen: boolean } & TaskSessionsProps) {
  const selectorId = useId();
  const [selected, setSelected] = useState(() => navigation.courseId ?? rememberedCourse()); const [creating, setCreating] = useState(false);
  const [reload, setReload] = useState(0);
  const state = useResource(`courses:${reload}`, signal => request<{ courses: Course[] }>('/courses', signal));
  useEffect(() => { if (navigation.courseId) { setSelected(navigation.courseId); setCreating(false); } }, [navigation.courseId, revision]);
  function select(id: string) { if (id !== selected) taskSessions.cancel(); setSelected(id); try { sessionStorage.setItem('learning-helper:selected-course', id); } catch { /* Optional browser preference only. */ } }
  const courses = state.status === 'success' ? state.data.courses : [];
  // An explicit unknown target must not silently render another course.
  const course = courses.find(c => c.id === selected) ?? (!selected ? courses[0] : undefined);
  return <div className="lh-panel" aria-label="Learning Helper"><header className="lh-panel-heading"><div><div className="lh-eyebrow">LEARNING HELPER</div><h1>让每次练习都有回响</h1></div></header>
    {!fullscreen && <p className="lh-compact-hint lh-muted">分栏空间较小时，可用右上角“全屏”专注学习。</p>}
    {state.status === 'loading' ? <Loading/> : state.status === 'error' ? <Failure message={state.error} retry={() => setReload(n => n + 1)}/> : <>
      {!!courses.length && <div className="lh-course-select"><label htmlFor={selectorId}>当前课程<select id={selectorId} aria-label="当前课程" value={course?.id ?? ''} onChange={e => { select(e.target.value); setCreating(false); }}>
        {!course && <option value="">请选择课程</option>}{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <Button onClick={() => setCreating(true)}>新建课程</Button></div>}
      {creating || !courses.length ? <CreateCourse onCreated={c => { select(c.id); setCreating(false); setReload(n => n + 1); }} cancel={courses.length ? () => setCreating(false) : undefined}/> :
        course ? <CourseWorkspace key={course.id} course={course} navigation={navigation.courseId === course.id ? navigation : {}}
          revision={revision} inputActions={inputActions} inputDraft={inputDraft} taskSessions={taskSessions} taskState={taskState}/> : <p className="lh-empty">请选择课程；之前的课程当前不可用。</p>}
    </>}
  </div>;
}
function CourseWorkspace({ course, navigation, revision, inputActions, inputDraft, taskSessions, taskState }: { course: Course; navigation: Navigation; revision: number; inputActions: InputActions; inputDraft: string } & TaskSessionsProps) {
  const [section, setSection] = useState<Section>(navigation.section ?? 'plan');
  const [quizId, setQuizId] = useState(navigation.quizId ?? ''); const [refresh, setRefresh] = useState(0); const [notice, setNotice] = useState('');
  useEffect(() => { if (!inputDraft.trim()) setNotice(''); }, [inputDraft]);
  const state = useResource(course.id, async signal => {
    const [dashboard, sources] = await Promise.all([request<StudentDashboard>(coursePath(course.id) + '/dashboard', signal),
      request<{ sources: Source[] }>(coursePath(course.id) + '/sources', signal)]);
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
      <Button aria-label="刷新课程" onClick={() => setRefresh(n => n + 1)}>刷新</Button></div>
    {state.refreshing && <Loading text="正在刷新…"/>}
    {course.status === 'active' && <div className="lh-agent-actions">
      <Button variant="outline" disabled={!sources.some(s => s.status === 'ready')} onClick={() => ask(data.currentPlan ? 'quiz' : 'plan')}>{data.currentPlan ? '让 Agent 生成 5 题练习' : '让 Agent 生成 3 天计划'}</Button>
      {data.concepts.some(c => c.status === 'weak') && <Button onClick={() => ask('review')}>复习薄弱点</Button>}
      <p className="lh-muted">上方快捷动作填入当前聊天框，确认后发送。计划任务中的“新会话”会直接开始学习。</p>{notice && <p role="status">{notice}</p>}
    </div>}
    {section === 'course' && <Sources courseId={course.id} sources={sources} reload={() => setRefresh(n => n + 1)}/>}
    {section === 'plan' && <PlanView data={data} taskSessions={taskSessions} taskState={taskState}/>}
    {section === 'progress' && <ProgressView data={data}/>}
    {section === 'quiz' && (quizId ? <QuizView key={quizId} courseId={course.id} quizId={quizId} concepts={data.concepts}
      back={() => setQuizId('')} onSubmitted={() => setRefresh(n => n + 1)}/> : <section aria-label="练习列表"><h2>练习与回顾</h2>
        {!data.quizzes.length ? <p className="lh-empty">还没有练习。计划就绪后，让 Agent 从课程资料生成题目。</p> : <ul className="lh-quiz-list">{data.quizzes.map(q => <li key={q.id}>
          <div className="lh-row"><strong>{q.purpose}</strong><Tag tone={q.submitted ? 'success' : 'neutral'}>{q.submitted ? `已完成 · ${q.correctCount}/${q.itemCount}` : `${q.itemCount} 题 · 未作答`}</Tag></div>
          <Button variant="outline" onClick={() => setQuizId(q.id)}>{q.submitted ? '查看反馈' : '开始练习'}</Button>
        </li>)}</ul>}
      </section>)}
  </div>;
}
