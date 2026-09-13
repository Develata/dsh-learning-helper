import { z } from 'zod';
import { pdfModeSchema } from '../domain/assets.js';
import { readWorkspaceFile, writeWorkspaceFile } from './files.js';
import { validate } from '../services/evidence.js';
export const mineruConfigSchema = z.strictObject({ enabled: z.boolean(), baseUrl: z.string().max(2000).optional(),
  provider: z.enum(['self-hosted', 'cloud']).optional(), cloudModel: z.enum(['vlm', 'pipeline']).optional(),
  backend: z.enum(['pipeline', 'vlm-engine', 'hybrid-engine']).default('pipeline'), timeoutSeconds: z.number().int().min(10).max(600).default(600),
}).superRefine((v, ctx) => {
  if (v.enabled && v.provider !== 'cloud' && !v.baseUrl) ctx.addIssue({ code: 'custom', message: 'MinerU base URL required' });
  if (v.provider === 'cloud' && v.baseUrl) ctx.addIssue({ code: 'custom', message: 'MinerU cloud uses the fixed official endpoint' });
  if (v.baseUrl) { try { const u = new URL(v.baseUrl); if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.search || u.hash) throw new Error(); }
    catch { ctx.addIssue({ code: 'custom', message: 'Use a trusted HTTP(S) MinerU base URL without credentials/query/fragment' }); } }
});
export type MinerUConfig = z.infer<typeof mineruConfigSchema>;
export const configSchema = z.strictObject({ schemaVersion: z.literal(2), documentParsing: z.strictObject({ pdfMode: pdfModeSchema, mineru: mineruConfigSchema }) });
export type WorkspaceConfig = z.infer<typeof configSchema>;
export function readConfig(root: string): WorkspaceConfig {
  return validate(configSchema, JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(readWorkspaceFile(root, '.learning-helper/config.json', 32_768))));
}
export function writeConfig(root: string, input: unknown): WorkspaceConfig {
  const config = validate(configSchema, input);
  writeWorkspaceFile(root, '.learning-helper/config.json', JSON.stringify(config, null, 2) + '\n'); return config;
}
