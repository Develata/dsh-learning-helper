import type { Context } from '@deepseek-ai/cordis';
import type {} from '@deepseek-ai/dsh-host-webserver';
import type {} from '@deepseek-ai/dsh-client-connection';
import z from '@deepseek-ai/schemastery';
import { HarnessLearningStore } from './providers/storage-domain.js';
import { LearningService } from './services/learning.js';
import { createHandler } from './host/http.js';
import { demoCourse } from './presets/math-analysis/demo.js';
import { SqliteEvidenceStore } from './providers/evidence-sqlite.js';
import { TextParser } from './providers/text-parser.js';
import { EvidenceService } from './services/evidence.js';
import { registerCourseTools } from './tools/course-tools.js';

export const name = 'learning-helper';
export const inject = ['storageDomain', 'webServer', 'connection', 'tools', 'systemPrompt'];
export interface Config { demo: boolean; evidencePath: string }
export const Config: z<Config> = z.object({ demo: z.boolean().default(false), evidencePath: z.string().required() });

/** Host lifetime owns one learning store; browser/Agent consumers never open competing domains. */
export async function apply(ctx: Context, config: Config): Promise<void> {
  const store = await HarnessLearningStore.open(ctx.storageDomain);
  try { ctx.effect(() => () => store.close()); }
  catch (error) { await store.close(); throw error; }
  const service = new LearningService(store);
  const evidence = new EvidenceService(service, new SqliteEvidenceStore(config.evidencePath), new TextParser());
  try { ctx.effect(() => () => evidence.close()); }
  catch (error) { await evidence.close(); throw error; }
  if (config.demo && !store.get('demo-calculus')) await service.create(demoCourse(new Date().toISOString()));
  ctx.effect(() => ctx.webServer.register({ kind: 'prefix', path: '/learning-helper/v1',
    handler: createHandler(service, error => ctx.logger.error(error), req => ctx.connection.requestRejection(req), evidence) }));
  registerCourseTools(ctx, service, evidence);
}
