import { useEffect, useRef, useState } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { Source } from './types.js';
import { request, sessionPath, errorText, RequestError } from './api.js';
import { defaultExamDate, validateFile } from './model.js';
import { Failure } from './common.js';
export function InitializeProject({ sessionId, onCreated }: { sessionId: string; onCreated: () => void }) {
  const [title, setTitle] = useState(''); const [subject, setSubject] = useState('数学分析');
  const [exam, setExam] = useState(defaultExamDate); const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const flight = useRef<AbortController | null>(null);
  const pending = useRef<{ title: string; subject: string; dailyMinutes: number; examAt?: string } | null>(null);
  useEffect(() => () => flight.current?.abort(), []);
  async function create() {
    if (flight.current) return;
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError('');
    const draft = pending.current ?? { title: title.trim(), subject: subject.trim(), dailyMinutes: minutes,
      ...(exam ? { examAt: new Date(`${exam}T23:59:59`).toISOString() } : {}) };
    pending.current = draft;
    try {
      await request(sessionPath(sessionId) + '/project', controller.signal, draft);
      if (!controller.signal.aborted) onCreated();
    } catch (e) { if (!controller.signal.aborted) {
      // Definitive validation rejection did not commit; allow the student to correct the draft.
      if (e instanceof RequestError && ['invalid-input', 'limit-exceeded'].includes(e.code)) pending.current = null;
      setError(errorText(e));
    } }
    finally { flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <form className="lh-form" aria-label="初始化学习项目" onChange={() => { if (!pending.current) setError(''); }} onSubmit={e => { e.preventDefault(); void create(); }}>
    <h2>在此 Workspace 启用 Learning Helper</h2><p className="lh-muted">先准备资料，再让 Agent 帮你安排复习。</p>
    <fieldset disabled={busy || pending.current !== null}>
      <label>课程名称<input required maxLength={4000} value={title} placeholder="例如：数学分析期中复习" onChange={e => setTitle(e.target.value)}/></label>
      <label>学科<input required maxLength={4000} value={subject} onChange={e => setSubject(e.target.value)}/></label>
      <div className="lh-form-grid"><label>考试日期（可选）<input type="date" max="9999-12-31" value={exam} onChange={e => setExam(e.target.value)}/></label>
        <label>每日学习分钟<input type="number" min={30} max={240} required value={minutes} onChange={e => setMinutes(Number(e.target.value))}/></label></div>
    </fieldset>
    {error && <Failure message={error} retry={() => void create()}/>}
    <div className="lh-row"><Button variant="primary" type="submit" disabled={busy || !title.trim() || !subject.trim() || !!error}>{busy ? '正在初始化…' : '初始化'}</Button>
</div>
  </form>;
}

import type { PdfMode } from '../domain/assets.js';
import type { WorkspaceConfig } from '../workspace/config.js';
import { useResource } from './resource.js';
export function Sources({ sessionId, sources, reload }: { sessionId: string; sources: Source[]; reload: () => void }) {
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<PdfMode>('auto'); const [optimize, setOptimize] = useState(true);
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [configReload, setConfigReload] = useState(0);
  const [pendingOptimization, setPendingOptimization] = useState<string | null>(null);
  const retryAction = useRef<(() => void) | null>(null);
  const flight = useRef<AbortController | null>(null); const base = sessionPath(sessionId);
  const settings = useResource(sessionId, async signal => {
    const [config, capability] = await Promise.all([request<WorkspaceConfig>(base + '/config', signal), request<{ vision: boolean }>(base + '/capabilities', signal)]);
    return { config, capability };
  }, configReload);
  const vision = settings.status === 'success' && settings.data.capability.vision;
  const configured = settings.status === 'success' && settings.data.config.documentParsing.mineru.enabled;
  const pending = sources.filter(s => s.status === 'processing' || s.parsing === 'processing' || s.assetization === 'processing').map(s => s.id).join(',');
  useEffect(() => () => flight.current?.abort(), []);
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(reload, 2000);
    const stop = setTimeout(() => { clearInterval(timer); setNotice('自动状态检查已停止，请手动刷新。解析任务有独立超时和恢复状态。'); }, 610_000);
    return () => { clearInterval(timer); clearTimeout(stop); };
  }, [pending]);
  useEffect(() => {
    if (!pendingOptimization || busy || flight.current) return;
    const source = sources.find(s => s.id === pendingOptimization);
    if (source?.pageCount && source.status !== 'processing' && source.parsing !== 'processing') {
      setPendingOptimization(null); void assetize(source.id);
    }
  }, [pendingOptimization, sources, busy]);
  async function assetize(sourceId: string, retryUnknown = false) {
    if (flight.current) return;
    retryAction.current = () => { void assetize(sourceId, retryUnknown); };
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError('');
    try {
      await request(base + '/assetize', controller.signal, { sourceId, retryUnknown });
      if (!controller.signal.aborted) { setNotice('长期 Markdown 转换已提交，PDF 原件与已有证据会保留。'); reload(); }
    } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
    finally { flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  async function upload() {
    if (!file || flight.current) return;
    retryAction.current = () => { void upload(); };
    const invalid = validateFile(file); if (invalid) { setError(invalid); return; }
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError(''); setNotice('');
    try {
      if (/\.pdf$/i.test(file.name)) {
        const result = await request<{ sourceId: string }>(`${base}/sources/pdf?filename=${encodeURIComponent(file.name)}&mode=${mode}`, controller.signal, file, true);
        if (!controller.signal.aborted) { if (optimize && configured) setPendingOptimization(result.sourceId); setNotice('PDF 已接收，正在本地解析。可以稍后查看状态。'); reload(); }
      } else {
        const text = await file.text(); controller.signal.throwIfAborted();
        const result = await request<{ deduplicated: boolean }>(base + '/sources/text', controller.signal,
          { filename: file.name, mimeType: /\.md$/i.test(file.name) ? 'text/markdown' : 'text/plain', text });
        if (!controller.signal.aborted) { setNotice(result.deduplicated ? '资料已存在，已复用原资料。' : '资料已就绪，可以让 Agent 阅读。'); reload(); }
      }
    } catch (e) { if (!controller.signal.aborted) { setError(errorText(e)); reload(); } }
    finally { flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <section aria-label="课程资料"><h2>Workspace 学习资料</h2><p className="lh-muted">Markdown / TXT：512 KiB · PDF：64 MiB · 最多 200 份</p>
    {sources.length >= 100 && <p role="status">当前 Workspace 已有较多学习资料，建议将后续学习项目分开管理；已有历史引用仍会保留。</p>}
    <label className="lh-file">选择课程资料<input type="file" accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf" disabled={busy} onChange={e => {
      const next = e.target.files?.[0] ?? null; setFile(next); setError(next ? validateFile(next) ?? '' : ''); setNotice('');
    }}/></label>
    {file && /\.pdf$/i.test(file.name) && <fieldset disabled={busy} className="lh-form"><legend>PDF 解析方式</legend>
      {([['auto', '自动', vision ? '普通文本页本地解析，复杂页使用当前模型视觉能力。' : '普通文本页本地解析；复杂页会提示视觉能力不可用。'],
        ['local-fast', '本地快速', '只使用本地 PDF.js，不调用视觉模型。'],
        ['high-accuracy', '高精度', vision ? '全部页面使用当前模型，最多 64 个视觉页。' : '当前会话模型未声明 image 能力，暂不可用。']] as const).map(([value, label, description]) => <label key={value}>
          <span><input type="radio" name="pdf-mode" checked={mode === value} disabled={value === 'high-accuracy' && !vision} onChange={() => setMode(value)}/>{label}</span><small>{description}</small></label>)}
      <label><span><input type="checkbox" checked={optimize} disabled={!configured} onChange={e => setOptimize(e.target.checked)}/>使用 MinerU 转换为长期 Markdown 资产（推荐）</span></label>
      <p className="lh-muted">转换后 Agent 优先读取规范化资料；原始 PDF 用于公式、图片和出处核验。{!configured && ' MinerU 尚未配置，可在下方配置 API。'}</p>
    </fieldset>}
    <Button variant="outline" disabled={!file || busy || !!(file && validateFile(file)) || (mode === 'high-accuracy' && !vision && !!file && /\.pdf$/i.test(file.name))} onClick={() => void upload()}>{busy ? '正在处理…' : '上传资料'}</Button>
    {error && <Failure message={error} retry={() => retryAction.current?.()}/>}{notice && <p role="status">{notice}</p>}
    {settings.status === 'success' && <MinerUSettings sessionId={sessionId} initial={settings.data.config} onSaved={() => setConfigReload(n => n + 1)}/>}
    {settings.status === 'error' && <Failure message={settings.error} retry={() => setConfigReload(n => n + 1)}/>}
    {!sources.length ? <p className="lh-empty">还没有资料。上传一份讲义，让回答与练习有据可查。</p> : <ul className="lh-sources">{sources.map(s => <li key={s.id}>
      <div className="lh-row"><strong>{s.filename}</strong><Tag tone={s.status === 'ready' ? 'success' : s.status === 'failed' ? 'danger' : 'neutral'}>
        {s.status === 'ready' ? 'Ready · 就绪' : s.status === 'failed' ? '解析未完成 · 可重新上传' : '处理中'}</Tag></div>
      <p className="lh-muted">{s.pageCount ? `${s.pageCount} 页 · ` : ''}{s.chunkCount} 个资料片段{ s.originalAsset ? ' · 原始 PDF 已归档' : ''}</p>
      <p className="lh-muted">规范化资料：{s.parser.startsWith('mineru') ? 'MinerU Markdown' : s.parser.startsWith('vision') ? '视觉解析' : s.mimeType === 'application/pdf' ? 'PDF.js' : '原始文本'}</p>
      {s.parsing === 'processing' && <p role="status">正在完成页面解析，已有证据仍可查询…</p>}
      {s.parseWarning && <p role="status">{s.parseWarning === 'vision-unavailable' ? '当前模型不支持视觉解析。' : '增强解析未完成。'}已有可查询内容保持可用；可配置模型后重新上传。</p>}
      {s.assetization === 'processing' && <p role="status">正在转换长期 Markdown…</p>}
      {s.assetization === 'failed' && <p role="status">长期 Markdown 转换失败，已有 PDF 证据仍可使用。</p>}
      {s.assetization === 'outcome-unknown' && <p role="alert">提交结果未知。请先检查 MinerU，确认后再重试，避免创建重复远端任务。</p>}
      {s.mimeType === 'application/pdf' && !!s.pageCount && configured && s.parsing !== 'processing' && s.assetization !== 'processing' && s.assetization !== 'ready' &&
        <Button disabled={busy} onClick={() => void assetize(s.id, s.assetization === 'outcome-unknown')}>{s.assetization === 'outcome-unknown' ? '已检查 Provider，明确重新提交' : s.assetization === 'failed' ? '重试 MinerU' : '优化为长期 Markdown'}</Button>}
    </li>)}</ul>}
  </section>;
}
function MinerUSettings({ sessionId, initial, onSaved }: { sessionId: string; initial: WorkspaceConfig; onSaved: () => void }) {
  const [url, setUrl] = useState(initial.documentParsing.mineru.baseUrl ?? '');
  const [enabled, setEnabled] = useState(initial.documentParsing.mineru.enabled); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const flight = useRef<AbortController | null>(null); useEffect(() => () => flight.current?.abort(), []);
  async function save() {
    if (flight.current) return;
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError('');
    try { await request(sessionPath(sessionId) + '/config', controller.signal, { ...initial, documentParsing: { ...initial.documentParsing,
      mineru: { ...initial.documentParsing.mineru, enabled, ...(url.trim() ? { baseUrl: url.trim() } : { baseUrl: undefined }) } } });
      if (!controller.signal.aborted) onSaved();
    } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
    finally { flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  return <details className="lh-form"><summary>配置 MinerU API</summary><p className="lh-muted">支持官方自托管 protocol 2；填写你信任的服务地址。Token 由运行环境提供，不写入 Workspace。</p>
    <label>服务地址<input type="url" value={url} placeholder="http://127.0.0.1:8000" disabled={busy} onChange={e => setUrl(e.target.value)}/></label>
    <label><span><input type="checkbox" checked={enabled} disabled={busy} onChange={e => setEnabled(e.target.checked)}/>启用 MinerU</span></label>
    <Button disabled={busy || (enabled && !url.trim())} onClick={() => void save()}>{busy ? '正在保存…' : '保存配置'}</Button>
    {error && <Failure message={error} retry={() => void save()}/>}
  </details>;
}
