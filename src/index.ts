import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-client-connection';
import type {} from '@deepseek-ai/dsh-workspace';
import z from '@deepseek-ai/schemastery';
import { WorkspaceResolver } from './workspace/context.js';
import { WorkspaceProjects } from './workspace/projects.js';
import { workspaceHandler } from './host/workspace-http.js';
import { registerWorkspaceTools } from './tools/workspace-tools.js';
import { HarnessDocumentVision } from './providers/harness-vision.js';

export const name = 'learning-helper';
export const inject = ['workspaceRegistry', 'webServer', 'connection', 'tools', 'systemPrompt', 'llm', 'agents'];
export interface Config {}
export const Config: z<Config> = z.object({});

/** One Host instance dispatches to per-session workspace owners; no global learning store. */
export async function apply(ctx: Context, _config: Config): Promise<void> {
  // Public WorkspaceRegistry projection; membership already validates the Session header cwd.
  const registry = ctx.workspaceRegistry;
  const vision = new HarnessDocumentVision(ctx);
  const projects = new WorkspaceProjects(new WorkspaceResolver(() => registry.list()), vision);
  ctx.effect(() => () => projects.close());
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/learning-helper',
    handler: workspaceHandler(projects, req => ctx.connection.requestRejection(req), error => ctx.logger.error(error)) }));
  registerWorkspaceTools(ctx, projects, vision);
}
