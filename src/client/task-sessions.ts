import type { ObservableSnapshot } from '@deepseek-ai/dsh-client-store';
import type { ModelSelection } from '@deepseek-ai/dsh-api-session-controller/types';
import type { TaskLesson } from './task-prompt.js';

export class TaskSessionError extends Error {}
export const TASK_SESSIONS_KEY = 'learning-helper:task-sessions:v1';
const MAX_BOOKMARKS = 100;
export interface SessionSeed { cwd?: string; workspaceId?: string; preset?: string; model?: ModelSelection }
export interface TaskSession extends TaskLesson {
  sessionId: string; requestId: string; createdAt: string; seed: SessionSeed;
  phase: 'created' | 'prepared' | 'sent';
}
export interface TaskSessionState { entries: readonly TaskSession[]; busy: string | null; error: string | null }
export interface TaskSessionsProps { taskSessions: TaskSessions; taskState: TaskSessionState }
export interface TaskSessionPort {
  capture(): SessionSeed;
  create(entry: TaskSession, signal: AbortSignal): Promise<void>;
  prepare(entry: TaskSession, signal: AbortSignal): Promise<void>;
  send(entry: TaskSession, signal: AbortSignal): Promise<void>;
  open(entry: TaskSession, signal: AbortSignal): Promise<void>;
}
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;
const text = (v: unknown, max: number) => typeof v === 'string' && v.length > 0 && v.length <= max;
const id = (v: unknown) => text(v, 100) && /^[a-zA-Z0-9_-]+$/.test(v as string);
function valid(v: unknown): v is TaskSession {
  if (!v || typeof v !== 'object') return false;
  const e = v as TaskSession;
  return id(e.courseId) && id(e.planId) && id(e.taskId) && id(e.sessionId) && id(e.requestId) &&
    text(e.title, 160) && text(e.prompt, 16000) && text(e.createdAt, 40) && Number.isFinite(Date.parse(e.createdAt)) &&
    ['created', 'prepared', 'sent'].includes(e.phase) && !!e.seed && typeof e.seed === 'object' &&
    (e.seed.cwd === undefined || text(e.seed.cwd, 4096)) && (e.seed.workspaceId === undefined || id(e.seed.workspaceId)) &&
    (e.seed.preset === undefined || text(e.seed.preset, 200)) && (e.seed.model === undefined ||
      (!!e.seed.model && text(e.seed.model.provider, 200) && text(e.seed.model.model, 300) &&
        (e.seed.model.reasoningEffort === undefined || text(e.seed.model.reasoningEffort, 100))));
}
function read(storage: StoragePort): TaskSession[] {
  const raw = storage.getItem(TASK_SESSIONS_KEY);
  if (!raw) return [];
  if (raw.length > 2_000_000) throw new TaskSessionError('会话书签过大，请先检查浏览器存储。');
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new TaskSessionError('会话书签无法读取，聊天记录仍在会话列表中。'); }
  if (!Array.isArray(data) || data.length > MAX_BOOKMARKS || !data.every(valid) || new Set(data.map(e => e.sessionId)).size !== data.length)
    throw new TaskSessionError('会话书签无法读取，请检查浏览器存储；聊天记录仍在会话列表中。');
  return data;
}
/** A single plugin-owned operation survives panel unmount during navigation.
 * Only bookmarks/dispatch receipts live here. Harness owns the actual conversations.
 */
export class TaskSessions {
  private state: TaskSessionState;
  private readonly listeners = new Set<() => void>();
  private lifetime: AbortController | undefined;
  private disposed = false;
  readonly store: ObservableSnapshot<TaskSessionState> = {
    getSnapshot: () => this.state,
    subscribe: listener => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; },
  };
  constructor(private readonly port: TaskSessionPort, private readonly storage: StoragePort, private readonly timeoutMs = 30_000) {
    try { this.state = { entries: read(storage), busy: null, error: null }; }
    catch { this.state = { entries: [], busy: null, error: '无法读取会话书签，请允许浏览器本地存储；聊天记录仍在会话列表中。' }; }
  }
  private update(patch: Partial<TaskSessionState>) {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
  private save(entry: TaskSession) {
    // Merge the latest browser value to retain bookmarks made in another tab.
    const entries = read(this.storage);
    const previous = entries.find(e => e.sessionId === entry.sessionId);
    const next = previous?.phase === 'sent' ? previous : entry;
    const merged = [next, ...entries.filter(e => e.sessionId !== entry.sessionId)];
    if (merged.length > MAX_BOOKMARKS) throw new TaskSessionError('已达到 100 个任务会话书签，请从现有会话继续学习。');
    if (!valid(next)) throw new TaskSessionError('任务会话数据无效，请刷新计划后重试。');
    // Fail closed before remote writes: safe retry must retain identities and frozen prompt.
    try { this.storage.setItem(TASK_SESSIONS_KEY, JSON.stringify(merged)); }
    catch { throw new TaskSessionError('无法保存会话书签，请允许浏览器本地存储或释放空间后重试。'); }
    this.update({ entries: merged });
  }
  async start(lesson: TaskLesson) {
    await this.run(lesson.taskId, async signal => {
      const entry: TaskSession = { ...lesson, sessionId: `session-${crypto.randomUUID()}`, requestId: crypto.randomUUID(),
        createdAt: new Date().toISOString(), seed: this.port.capture(), phase: 'created' };
      this.save(entry);
      await this.dispatch(entry, signal);
    });
  }
  async resume(sessionId: string) {
    await this.run(sessionId, async signal => {
      const entry = read(this.storage).find(e => e.sessionId === sessionId);
      if (!entry) throw new TaskSessionError('会话书签不存在，请刷新计划。');
      this.update({ entries: read(this.storage) });
      if (entry.phase === 'sent') await this.port.open(entry, signal);
      else await this.dispatch(entry, signal);
    });
  }
  async open(sessionId: string) {
    await this.run(sessionId, async signal => {
      const entry = read(this.storage).find(e => e.sessionId === sessionId);
      if (!entry) throw new TaskSessionError('会话书签不存在，请刷新计划。');
      await this.port.open(entry, signal);
    });
  }
  private async dispatch(entry: TaskSession, signal: AbortSignal) {
    await this.port.create(entry, signal); signal.throwIfAborted();
    if (entry.phase === 'created') {
      await this.port.prepare(entry, signal); signal.throwIfAborted();
      entry = { ...entry, phase: 'prepared' }; this.save(entry);
    }
    // Freeze request identity through lost responses and browser reloads.
    await this.port.send(entry, signal); signal.throwIfAborted();
    this.save({ ...entry, phase: 'sent' });
    await this.port.open(entry, signal);
  }
  private async run(key: string, action: (signal: AbortSignal) => Promise<void>) {
    if (this.state.busy || this.disposed) return;
    const controller = new AbortController(); this.lifetime = controller;
    this.update({ busy: key, error: null });
    const timer = setTimeout(() => controller.abort(new TaskSessionError('连接超时。请用原会话的“重试开始”继续，不会重复发送。')), this.timeoutMs);
    let abort: () => void = () => {};
    try {
      const cancelled = new Promise<never>((_, reject) => { abort = () => reject(controller.signal.reason); controller.signal.addEventListener('abort', abort, { once: true }); });
      await Promise.race([action(controller.signal), cancelled]);
    } catch (error) {
      if (!this.disposed) this.update({ error: error instanceof TaskSessionError ? error.message : '会话操作失败，请检查连接后重试。' });
    } finally {
      clearTimeout(timer); controller.signal.removeEventListener('abort', abort);
      this.lifetime = undefined; if (!this.disposed) this.update({ busy: null });
    }
  }
  dispose() { this.disposed = true; this.lifetime?.abort(new TaskSessionError('学习插件已关闭')); this.listeners.clear(); }
  cancel() { this.lifetime?.abort(new TaskSessionError('已切换课程，任务会话操作已中断。可回到原课程重试确认发送结果。')); }
}
