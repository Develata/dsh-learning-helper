import type { Context } from '@deepseek-ai/cordis';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { ClientRemote } from '@deepseek-ai/dsh-api-remotes/client';
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client';
import type {} from '@deepseek-ai/dsh-client-ui-layout/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { TaskSessionError } from './task-sessions.js';
import type { TaskSession, TaskSessionPort, SessionSeed } from './task-sessions.js';
type SessionId = Parameters<ISessions['open']>[0];
type WorkspaceId = NonNullable<NonNullable<Parameters<ISessions['create']>[0]>['workspaceId']>;
type RequestId = NonNullable<Parameters<NonNullable<ReturnType<ISessions['binding']>>['session']['prompt']>[3]>;

/** Public Harness services only; no HTTP loopback, private API or composer draft writes. */
export function taskSessionPort(ctx: Context): TaskSessionPort {
  // Host and Browser deliberately use distinct sessions faces under the same service key.
  const sessions = ctx.get('sessions') as unknown as ISessions;
  const workspaces = ctx.get('workspaces') as IWorkspaces;
  const remote = ctx.get('remote') as ClientRemote;
  let navigation: { sessionId: string; signal: AbortSignal } | undefined;
  const binding = (entry: TaskSession) => {
    const value = sessions.binding(entry.sessionId as SessionId);
    if (!value) throw new TaskSessionError('会话暂不可用，请刷新后重试。');
    return value;
  };
  const verifyWorkspace = (entry: TaskSession) => {
    const owners = workspaces.list.getSnapshot().items.filter(w => w.sessionIds.includes(entry.sessionId as SessionId));
    if (owners.length !== 1 || owners[0]!.workspaceId !== entry.seed.workspaceId)
      throw new TaskSessionError('任务会话的 Workspace 归属尚未确认或已改变，请刷新后重试。');
  };
  return {
    capture() {
      const list = sessions.list.getSnapshot();
      const source = list.current ? list.byId[list.current] : undefined;
      if (!source || source.origin === 'subagent') throw new TaskSessionError('请先打开普通聊天会话，再从计划开始学习。');
      const workspace = workspaces.list.getSnapshot().items.find(w => w.sessionIds.includes(source.id));
      const projected = source.projectionValues;
      const seed: SessionSeed = {};
      if (!workspace) throw new TaskSessionError('请先选择有效 Workspace。');
      seed.workspaceId = workspace.workspaceId;
      const preset = (projected as Readonly<Record<string, unknown>> | undefined)?.agentPreset;
      if (typeof preset === 'string' && preset) seed.preset = preset;
      if (projected?.modelSelection?.next) seed.model = projected.modelSelection.next;
      return seed;
    },
    async create(entry, signal) {
      signal.throwIfAborted();
      if (!entry.seed.workspaceId) throw new TaskSessionError('任务会话需要有效 Workspace。');
      navigation = { sessionId: entry.sessionId, signal: ctx.layout.beginNavigation() };
      try {
        await sessions.create({ sessionId: entry.sessionId as SessionId,
          workspaceId: entry.seed.workspaceId as WorkspaceId });
      } catch { throw new TaskSessionError('学习会话创建未确认，请用“重试开始”继续。'); }
      signal.throwIfAborted();
    },
    async prepare(entry, signal) {
      signal.throwIfAborted(); verifyWorkspace(entry);
      if (entry.seed.preset) {
        const preset = await remote.agentPresets.select(entry.sessionId as SessionId, entry.seed.preset);
        signal.throwIfAborted();
        if (!preset.ok) throw new TaskSessionError('无法沿用当前 Agent 配置，请检查会话设置后重试。');
      }
      if (entry.seed.model) {
        const model = await remote.session.selectModel({ sessionId: entry.sessionId as SessionId, ...entry.seed.model });
        signal.throwIfAborted();
        if (!model.ok) throw new TaskSessionError('无法沿用当前模型，请检查模型设置后重试。');
      }
      const renamed = await binding(entry).session.rename(entry.title);
      signal.throwIfAborted();
      if (!renamed.ok) throw new TaskSessionError('会话标题保存失败，请重试开始。');
    },
    async send(entry, signal) {
      signal.throwIfAborted(); verifyWorkspace(entry);
      const result = await binding(entry).session.prompt([{ type: 'text', text: entry.prompt }], 'queue', signal, entry.requestId as RequestId);
      signal.throwIfAborted();
      if (!result.ok) throw new TaskSessionError('学习请求发送未确认，请检查连接和模型配置，再用“重试开始”继续。');
    },
    async open(entry, signal) {
      signal.throwIfAborted();
      const pending = navigation; navigation = undefined;
      if (pending?.sessionId === entry.sessionId && pending.signal.aborted)
        throw new TaskSessionError('学习请求已发送。你已切换页面，可点击“继续学习”打开该会话。');
      if (!sessions.list.getSnapshot().byId[entry.sessionId as SessionId]) await sessions.refresh();
      signal.throwIfAborted();
      if (!sessions.list.getSnapshot().byId[entry.sessionId as SessionId] || workspaces.list.getSnapshot().archivedSessionIds.includes(entry.sessionId as SessionId))
        throw new TaskSessionError('会话已不可用，请在会话列表检查是否已归档。');
      verifyWorkspace(entry);
      // Use the sidebar's own state owner, rather than only hiding its layout track.
      if (ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded();
      sessions.open(entry.sessionId as SessionId);
      ctx.layout.selectPanel(null);
    },
  };
}
