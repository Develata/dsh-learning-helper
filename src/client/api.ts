const ROOT = '/learning-helper/v2';
const messages: Record<string, string> = {
  unauthorized: '会话已过期，请重新打开 Harness 登录链接。', forbidden: '当前浏览器来源未获允许，请从 Harness 页面打开。',
  'not-found': '课程或练习不存在，请刷新后重试。', conflict: '内容状态已变化，请刷新检查；已提交的练习不能再次作答。',
  'invalid-input': '内容格式不符合要求，请检查输入后重试。', 'limit-exceeded': '内容超过限额，请缩小文件或输入后重试。',
  unavailable: '暂时无法保存或读取，请重试。', closed: '服务正在关闭，请稍后重试。',
};
export class RequestError extends Error { constructor(readonly code: string) { super(messages[code] ?? '网络请求未完成，请重试。'); } }
/** Same-origin cookie carrier only; no launch token or Host stack enters UI state. */
export async function request<T>(path: string, signal: AbortSignal, body?: unknown, binary = false, method: 'GET' | 'POST' | 'DELETE' = body === undefined ? 'GET' : 'POST'): Promise<T> {
  if (!/^\/sessions\/[a-zA-Z0-9_-]{1,80}\//u.test(path)) throw new Error('Unsupported Learning API path');
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), binary ? 45_000 : 12_000);
  try {
    signal.throwIfAborted();
    const response = await fetch(ROOT + path, { method,
      credentials: 'same-origin', mode: 'same-origin', cache: 'no-store', signal: controller.signal,
      ...(body === undefined ? {} : { headers: { 'content-type': binary ? 'application/pdf' : 'application/json' }, body: binary ? body as Blob : JSON.stringify(body) }) });
    if (!response.ok) {
      const value = await response.json().catch(() => null) as { error?: { code?: string } } | null;
      throw new RequestError(value?.error?.code ?? 'network');
    }
    return await response.json() as T;
  } catch (error) {
    if (signal.aborted) throw signal.reason;
    throw error instanceof RequestError ? error : new RequestError('network');
  } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
}
export const sessionPath = (id: string) => `/sessions/${encodeURIComponent(id)}`;
export const errorText = (e: unknown) => e instanceof RequestError ? e.message : '操作未完成，请重试。';
