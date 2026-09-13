import { useEffect, useRef, useState } from 'react';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { WorkspaceConfig } from '../workspace/config.js';
import { request, sessionPath, errorText } from './api.js';
import { Failure } from './common.js';

export interface MinerUCredentialStatus { configured: boolean; writable: boolean }
export function MinerUSettings({ sessionId, initial, credential, onSaved }: {
  sessionId: string; initial: WorkspaceConfig; credential: MinerUCredentialStatus; onSaved: () => void;
}) {
  const [provider, setProvider] = useState(initial.documentParsing.mineru.provider ?? 'self-hosted');
  const [url, setUrl] = useState(initial.documentParsing.mineru.baseUrl ?? '');
  const [model, setModel] = useState(initial.documentParsing.mineru.cloudModel ?? 'vlm');
  const [token, setToken] = useState(''); const [enabled, setEnabled] = useState(initial.documentParsing.mineru.enabled);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const flight = useRef<AbortController | null>(null); useEffect(() => () => flight.current?.abort(), []);
  const lastAction = useRef(false);
  const base = sessionPath(sessionId);
  async function act(remove = false) {
    if (flight.current) return;
    lastAction.current = remove;
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError(''); setNotice('');
    try {
      if (remove) {
        await request(base + '/mineru-credential', controller.signal, undefined, false, 'DELETE');
        setToken(''); setNotice('云端密钥已移除；已有资料与证据保留。');
      } else {
        if (provider === 'cloud' && token.trim()) {
          await request(base + '/mineru-credential', controller.signal, { token: token.trim() });
          setToken('');
        }
        const { baseUrl: _oldUrl, ...previous } = initial.documentParsing.mineru;
        await request(base + '/config', controller.signal, { ...initial, documentParsing: { ...initial.documentParsing,
          mineru: { ...previous, provider, enabled, cloudModel: model, ...(provider === 'self-hosted' && url.trim() ? { baseUrl: url.trim() } : {}) } } });
        setNotice(provider === 'cloud' ? '配置已保存。密钥有效性会在首次转换时验证。' : '配置已保存。');
      }
      if (!controller.signal.aborted) onSaved();
    } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
    finally { flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  const missing = enabled && (provider === 'cloud' ? !credential.configured && !token.trim() : !url.trim());
  return <details className="lh-form"><summary>配置 MinerU API</summary>
    <fieldset disabled={busy} className="lh-form">
      <label>MinerU 服务<select value={provider} onChange={e => { setProvider(e.target.value as typeof provider); setToken(''); setNotice(''); }}>
        <option value="cloud">mineru.net 官方云端</option><option value="self-hosted">官方自托管 protocol 2</option>
      </select></label>
      {provider === 'cloud' ? <>
        <p className="lh-muted">上传的 PDF 会发送到 mineru.net。密钥由此主机的凭据服务按 Workspace 保存，不写入课程文件，也不会回显。</p>
        <label>云端解析模型<select value={model} onChange={e => setModel(e.target.value as typeof model)}><option value="vlm">VLM（公式与布局）</option><option value="pipeline">Pipeline</option></select></label>
        <p role="status">{credential.configured ? '云端密钥已保存；留空保留原密钥。' : '尚未配置云端密钥。'}</p>
        <label>MinerU API 密钥<input type="password" autoComplete="new-password" spellCheck={false} maxLength={8192} value={token}
          placeholder={credential.configured ? '填写以替换密钥' : '粘贴 mineru.net API Token'} disabled={!credential.writable}
          onChange={e => setToken(e.target.value)}/></label>
        {!credential.writable && <p className="lh-muted">当前主机凭据存储不可写。</p>}
        <p className="lh-muted">云端单文件最多 200 页；密钥在 mineru.net 的 API 管理页面创建。</p>
        {credential.configured && <Button disabled={!credential.writable} onClick={() => void act(true)}>移除云端密钥</Button>}
      </> : <>
        <p className="lh-muted">填写可信自托管服务地址。自托管 Token 继续由运行环境提供。</p>
        <label>服务地址<input type="url" value={url} placeholder="http://host.docker.internal:8000" onChange={e => setUrl(e.target.value)}/></label>
      </>}
      <label><span><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)}/>启用 MinerU</span></label>
      <Button disabled={missing} onClick={() => void act()}>{busy ? '正在保存…' : '保存配置'}</Button>
    </fieldset>
    {error && <Failure message={error} retry={() => void act(lastAction.current)}/>}{notice && <p role="status">{notice}</p>}
  </details>;
}
