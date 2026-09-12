import { useEffect, useRef, useState } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Course, Source } from './types.js';
import { request, coursePath, errorText } from './api.js';
import { defaultExamDate, validateFile } from './model.js';
import { Failure } from './common.js';
export function CreateCourse({ onCreated, cancel }: { onCreated: (course: Course) => void; cancel?: (() => void) | undefined }) {
  const [title, setTitle] = useState(''); const [subject, setSubject] = useState('数学分析');
  const [exam, setExam] = useState(defaultExamDate); const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const flight = useRef<AbortController | null>(null);
  const pending = useRef<{ id: string; title: string; subject: string; dailyMinutes: number; examAt?: string } | null>(null);
  useEffect(() => () => flight.current?.abort(), []);
  async function create() {
    if (flight.current) return;
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError('');
    const draft = pending.current ?? { id: `course-${crypto.randomUUID()}`, title: title.trim(), subject: subject.trim(), dailyMinutes: minutes,
      ...(exam ? { examAt: new Date(`${exam}T23:59:59`).toISOString() } : {}) };
    pending.current = draft;
    try {
      // A timed-out create may already have committed. Reuse identity and recover it on retry.
      const { courses } = await request<{ courses: Course[] }>('/courses', controller.signal);
      const existing = courses.find(c => c.id === draft.id);
      const course = existing ?? (await request<{ course: Course }>('/courses', controller.signal, draft)).course;
      if (!controller.signal.aborted) onCreated(course);
    } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
    finally { flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <form className="lh-form" aria-label="创建课程" onSubmit={e => { e.preventDefault(); void create(); }}>
    <h2>开始一门课程</h2><p className="lh-muted">先准备资料，再让 Agent 帮你安排复习。</p>
    <fieldset disabled={busy || pending.current !== null}>
      <label>课程名称<input required maxLength={4000} value={title} placeholder="例如：数学分析期中复习" onChange={e => setTitle(e.target.value)}/></label>
      <label>学科<input required maxLength={4000} value={subject} onChange={e => setSubject(e.target.value)}/></label>
      <div className="lh-form-grid"><label>考试日期（可选）<input type="date" value={exam} onChange={e => setExam(e.target.value)}/></label>
        <label>每日学习分钟<input type="number" min={30} max={240} required value={minutes} onChange={e => setMinutes(Number(e.target.value))}/></label></div>
    </fieldset>
    {error && <Failure message={error} retry={() => void create()}/>}
    <div className="lh-row"><Button variant="primary" type="submit" disabled={busy || !title.trim() || !subject.trim() || !!error}>{busy ? '正在创建…' : '创建课程'}</Button>
      {cancel && <Button onClick={cancel}>取消</Button>}</div>
  </form>;
}
export function Sources({ courseId, sources, reload }: { courseId: string; sources: Source[]; reload: () => void }) {
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const flight = useRef<AbortController | null>(null);
  useEffect(() => () => flight.current?.abort(), []);
  async function upload() {
    if (!file || flight.current) return;
    const invalid = validateFile(file); if (invalid) { setError(invalid); return; }
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError(''); setNotice('');
    try {
      const text = await file.text(); controller.signal.throwIfAborted();
      const result = await request<{ source: Source; deduplicated: boolean }>(`${coursePath(courseId)}/sources/text`, controller.signal,
        { filename: file.name, mimeType: /\.md$/i.test(file.name) ? 'text/markdown' : 'text/plain', text });
      if (!controller.signal.aborted) { setNotice(result.deduplicated ? '资料已存在，已复用原资料。' : '资料已就绪，可以让 Agent 阅读。'); reload(); }
    } catch (e) { if (!controller.signal.aborted) { setError(errorText(e)); reload(); } }
    finally { flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section aria-label="课程资料"><h2>课程资料</h2><p className="lh-muted">支持 Markdown / TXT · 每份最多 512 KiB</p>
    <label className="lh-file">选择课程资料<input type="file" accept=".txt,.md,text/plain,text/markdown" disabled={busy} onChange={e => {
      const next = e.target.files?.[0] ?? null; setFile(next); setError(next ? validateFile(next) ?? '' : ''); setNotice('');
    }}/></label>
    <Button variant="outline" disabled={!file || busy || !!(file && validateFile(file))} onClick={() => void upload()}>{busy ? '正在处理资料…' : '上传资料'}</Button>
    {error && <Failure message={error} retry={() => void upload()}/>}{notice && <p role="status">{notice}</p>}
    {!sources.length ? <p className="lh-empty">还没有资料。上传一份讲义，让回答与练习有据可查。</p> : <ul className="lh-sources">{sources.map(s => <li key={s.id}>
      <div className="lh-row"><strong>{s.filename}</strong><Tag tone={s.status === 'ready' ? 'success' : s.status === 'failed' ? 'danger' : 'neutral'}>
        {s.status === 'ready' ? 'Ready · 就绪' : s.status === 'failed' ? '失败 · 请重新上传' : '处理中'}</Tag></div>
      <span className="lh-muted">{s.chunkCount} 个资料片段</span>
    </li>)}</ul>}
  </section>;
}
