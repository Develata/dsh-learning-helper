import type { Context } from '@deepseek-ai/cordis';
import type { InjectFace, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client';
import type {} from '@deepseek-ai/dsh-client-ui-session/client';
import type { InputState } from '@deepseek-ai/dsh-client-ui-conversation/client';
import type {} from '@deepseek-ai/dsh-client-ui-tool/client';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar-right/client';
import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import { LearningPanel } from './panel.js';
import { LearningToolCard } from './tool-views.js';
import { learningToolNames } from './tool-model.js';
import type { ISessions } from '@deepseek-ai/dsh-api-session-controller/client';
import type { IWorkspaces } from '@deepseek-ai/dsh-api-workspace-controller/client';
import type { Navigation } from './types.js';
import css from './styles.css';
import { registerLearningBrand } from './brand.js';
import { TaskSessions } from './task-sessions.js';
import { taskSessionPort } from './task-session-port.js';
export const inject = ['slots', 'sidebarRightTabs', 'sidebarRight', 'sessions', 'workspaces', 'remote', 'remote.session', 'remote.agentPresets', 'layout'];
const TAB = 'learning-helper';
declare module '@deepseek-ai/dsh-client-ui-sidebar-right/client' {
  interface SidebarRightTabParamsMap { 'learning-helper': Navigation }
}
interface TaskSessionsInjected { taskSessions: TaskSessions; hooks: { taskSessions: TaskSessions['store']; sessionList: ISessions['list']; workspaceList: IWorkspaces['list'] } }
function PanelSeat({ useTabInfo, inputActions, useInput, taskSessions, useTaskSessions, useSessionList, useWorkspaceList }: PropsRuntime<'sidebar.right.pane.tab'> & InjectFace<TaskSessionsInjected>) {
  const { tab, sidebar } = useTabInfo();
  const draft = useInput((s: InputState) => s.draft);
  const taskState = useTaskSessions(s => s);
  const current = useSessionList(s => s.current);
  const registered = useWorkspaceList(s => !!current && s.items.some(w => w.sessionIds.includes(current)));
  const sessionId = registered && current ? current : null;
  return tab.visible ? <LearningPanel key={`${sessionId}:${tab.navigation.revision}`} sessionId={sessionId} navigation={(tab.navigation.params ?? {}) as Navigation} revision={tab.navigation.revision}
    inputActions={inputActions} inputDraft={draft} fullscreen={sidebar.fullscreen} taskSessions={taskSessions} taskState={taskState}/> : null;
}
/** One native client plugin; every registration/style owns a Cordis disposer. */
export function apply(ctx: Context): void {
  registerLearningBrand(ctx);
  const taskSessions = new TaskSessions(taskSessionPort(ctx), {
    getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value),
  });
  ctx.effect(() => () => taskSessions.dispose());
  ctx.effect(() => { const tag = document.createElement('style'); tag.dataset.pluginCss = 'learning-helper'; tag.textContent = css; document.head.append(tag); return () => tag.remove(); });
  ctx.effect(() => ctx.sidebarRightTabs.register({ id: TAB, kind: TAB, title: () => '学习',
    guide: [{ order: 10, title: () => '学习', description: () => '课程资料、练习与自适应复习计划' }] }));
  ctx.effect(() => ctx.slots.inject('conversation.session.header.actions', () => ctx.slots.register({
    name: 'conversation.session.header.actions', id: TAB,
  }, () => <Button aria-label="打开学习面板" onClick={() => ctx.sidebarRight.openTab(TAB)}>学习</Button>)));
  ctx.effect(() => ctx.slots.inject('conversation.input.left', () => ctx.slots.register({ name: 'conversation.input.left', id: TAB },
    ({ useSession, useConversation }: PropsRuntime<'conversation.input.left'>) => {
      const blank = useSession((s: { blank: boolean; running: boolean; promptAttempted: boolean }) => s.blank && !s.running && !s.promptAttempted);
      const active = useConversation(s => s.activeTargets.size > 0);
      return blank && !active ? <Button aria-label="打开学习面板" onClick={() => ctx.sidebarRight.openTab(TAB)}>学习</Button> : null;
    })));
  ctx.effect(() => ctx.slots.inject('sidebar.right.pane.tab', () => ctx.slots.register({ name: 'sidebar.right.pane.tab', key: TAB,
    inject: (): TaskSessionsInjected => ({ taskSessions, hooks: { taskSessions: taskSessions.store, sessionList: (ctx.get('sessions') as unknown as ISessions).list, workspaceList: (ctx.get('workspaces') as IWorkspaces).list } }),
  }, PanelSeat)));
  for (const name of learningToolNames) ctx.effect(() => ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview', key: name,
  }, ({ block }: PropsRuntime<'tool.call.toolview'>) => <LearningToolCard name={name} block={block}
    open={params => ctx.sidebarRight.openTab(TAB, { params })}/>)));
}
