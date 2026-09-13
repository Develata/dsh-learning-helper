import { z } from 'zod';
import { setTimeout as delay } from 'node:timers/promises';
import { LearningError } from '../domain/errors.js';
import { WORKSPACE_LIMITS as Q } from '../domain/assets.js';
import { mineruConfigSchema } from '../workspace/config.js';
import type { MinerUConfig } from '../workspace/config.js';
import { validate } from '../services/evidence.js';

const taskSchema = z.object({ task_id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), status: z.enum(['pending', 'processing', 'completed', 'failed']) });
export type MinerUTask = z.infer<typeof taskSchema>;
export class UnknownMinerUSubmission extends LearningError {
  constructor() { super('unavailable', 'MinerU submission outcome unknown; no automatic resubmission. Check the provider before explicitly retrying.'); }
}
export class MinerUTaskTerminalError extends LearningError {
  constructor() { super('unavailable', 'MinerU task failed or was lost; PDF evidence remains available. Explicit retry starts a new task.'); }
}
export interface MinerUOutput { version: string; markdown: string; blocks: { page: number; text: string }[]; media: { name: string; bytes: Uint8Array }[] }
export interface DocumentAssetizer {
  health(signal: AbortSignal): Promise<void>;
  submit(bytes: Uint8Array, signal: AbortSignal): Promise<MinerUTask>;
  status(id: string, signal: AbortSignal): Promise<MinerUTask>;
  result(id: string, pageCount: number, signal: AbortSignal): Promise<MinerUOutput>;
}
/** Official self-hosted MinerU protocol 2; never follows provider-supplied URLs or ZIP paths. */
export class MinerUAssetizer implements DocumentAssetizer {
  private readonly base: string;
  private readonly config: MinerUConfig;
  constructor(config: MinerUConfig, private readonly token?: string, private readonly transport: typeof fetch = fetch) {
    this.config = validate(mineruConfigSchema, config);
    if (!this.config.enabled || !this.config.baseUrl) throw new LearningError('unavailable', 'MinerU is not configured');
    this.base = this.config.baseUrl.replace(/\/+$/u, '');
  }
  private async request(path: string, signal: AbortSignal, body?: FormData, maxBytes = 64 * 1024): Promise<{ status: number; data: unknown }> {
    const response = await this.transport(this.base + path, { method: body ? 'POST' : 'GET', ...(body ? { body } : {}), redirect: 'error',
      headers: this.token ? { authorization: `Bearer ${this.token}` } : {}, signal: AbortSignal.any([signal, AbortSignal.timeout(body ? 60_000 : 30_000)]) });
    if (!response.body) throw new LearningError('unavailable', 'MinerU returned an empty response');
    const reader = response.body.getReader(); const buffers: Uint8Array[] = []; let size = 0;
    try {
      if (Number(response.headers.get('content-length')) > maxBytes) throw new LearningError('limit-exceeded', 'MinerU response exceeds limit');
      while (true) { signal.throwIfAborted(); const { done, value } = await reader.read(); if (done) break; size += value.length;
        if (size > maxBytes) throw new LearningError('limit-exceeded', 'MinerU response exceeds limit'); buffers.push(value); }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(buffers, size));
      return { status: response.status, data: JSON.parse(text) as unknown };
    } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
  }
  async health(signal: AbortSignal): Promise<void> {
    const r = await this.request('/health', signal);
    if (r.status !== 200 || !z.object({ status: z.literal('healthy'), protocol_version: z.literal(2) }).safeParse(r.data).success)
      throw new LearningError('unavailable', 'MinerU requires healthy official self-hosted protocol 2');
  }
  async submit(bytes: Uint8Array, signal: AbortSignal): Promise<MinerUTask> {
    signal.throwIfAborted(); if (bytes.length > Q.pdfBytes) throw new LearningError('limit-exceeded', 'PDF exceeds limit');
    const body = new FormData(); body.set('files', new Blob([Uint8Array.from(bytes)], { type: 'application/pdf' }), 'document.pdf');
    for (const [key, value] of Object.entries({ backend: this.config.backend, lang_list: 'ch', parse_method: 'auto', formula_enable: 'true', table_enable: 'true',
      return_md: 'true', return_content_list: 'true', return_images: 'true', response_format_zip: 'false' })) body.set(key, value);
    let r: { status: number; data: unknown };
    try { r = await this.request('/tasks', signal, body); } catch { throw new UnknownMinerUSubmission(); }
    if (r.status >= 400 && r.status < 500) throw new LearningError('invalid-input', 'MinerU rejected the task; check provider configuration');
    const parsed = taskSchema.safeParse(r.data);
    if (r.status !== 202 || !parsed.success) throw new UnknownMinerUSubmission();
    return parsed.data;
  }
  async status(id: string, signal: AbortSignal): Promise<MinerUTask> {
    validate(taskSchema.shape.task_id, id);
    const r = await this.request(`/tasks/${id}`, signal);
    if (r.status === 404) throw new MinerUTaskTerminalError();
    if (r.status !== 200) throw new LearningError('unavailable', 'MinerU status unavailable');
    const task = validate(taskSchema, r.data);
    if (task.task_id !== id) throw new LearningError('invalid-input', 'MinerU task identity mismatch'); return task;
  }
  async result(id: string, pageCount: number, signal: AbortSignal): Promise<MinerUOutput> {
    validate(taskSchema.shape.task_id, id);
    const r = await this.request(`/tasks/${id}/result`, signal, undefined, 110 * 1024 * 1024);
    if (r.status !== 200) throw new LearningError('unavailable', 'MinerU result is not available');
    return parseMinerUResult(r.data, pageCount);
  }
}
const string = z.string().max(Q.generationBytes).refine(t => t.isWellFormed() && !t.includes('\0'));
const blockSchema = z.object({ page_idx: z.number().int().min(0).max(Q.pages - 1), type: z.string().max(60),
  text: string.optional(), content: string.optional(), text_level: z.number().int().min(0).max(6).optional(),
  img_path: z.string().max(200).optional(), table_body: string.optional(),
  image_caption: z.array(string).max(100).optional(), image_footnote: z.array(string).max(100).optional(),
  table_caption: z.array(string).max(100).optional(), table_footnote: z.array(string).max(100).optional(), list_items: z.array(string).max(1000).optional(),
});
export function parseMinerUResult(input: unknown, pageCount: number): MinerUOutput {
  const result = validate(z.object({ version: z.string().min(1).max(60), results: z.record(z.string(), z.object({ md_content: string.min(1),
    content_list: z.string().max(16 * 1024 * 1024), images: z.record(z.string(), z.string()).default({}) })) }), input);
  const files = Object.values(result.results); if (files.length !== 1) throw new LearningError('invalid-input', 'MinerU returned an unexpected file count');
  const file = files[0]!;
  if (!file.md_content.trim() || Buffer.byteLength(file.md_content) > Q.generationBytes) throw new LearningError('limit-exceeded', 'MinerU Markdown exceeds limit');
  const items = validate(z.array(blockSchema).min(1).max(Q.generationChunks), JSON.parse(file.content_list));
  const media: MinerUOutput['media'] = []; let bytes = 0;
  if (Object.keys(file.images).length > Q.mediaFiles) throw new LearningError('limit-exceeded', 'MinerU media count exceeded');
  for (const [name, encoded] of Object.entries(file.images)) {
    if (!/^[a-zA-Z0-9_-]{1,160}\.(?:png|jpe?g|webp)$/iu.test(name)) throw new LearningError('invalid-input', 'Unsafe MinerU media filename');
    const match = /^data:image\/(?:png|jpeg|webp);base64,([A-Za-z0-9+/]*={0,2})$/u.exec(encoded);
    if (!match || match[1]!.length % 4 !== 0) throw new LearningError('invalid-input', 'Malformed MinerU image');
    if (Math.floor(match[1]!.length / 4) * 3 > Q.mediaBytes - bytes + 2) throw new LearningError('limit-exceeded', 'MinerU media byte quota exceeded');
    const data = Buffer.from(match[1]!, 'base64'); bytes += data.length;
    const png = data.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
    const jpeg = data[0] === 255 && data[1] === 216 && data[2] === 255;
    const webp = data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP';
    if (!(name.toLowerCase().endsWith('.png') ? png : /\.jpe?g$/i.test(name) ? jpeg : webp)) throw new LearningError('invalid-input', 'MinerU image signature mismatch');
    if (bytes > Q.mediaBytes) throw new LearningError('limit-exceeded', 'MinerU media byte quota exceeded');
    media.push({ name, bytes: data });
  }
  const names = new Set(media.map(m => m.name)); let total = 0;
  const blocks = items.map(item => {
    if (item.page_idx >= pageCount) throw new LearningError('invalid-input', 'MinerU page exceeds original PDF');
    let image = '';
    if (item.img_path) {
      const match = /^images\/([a-zA-Z0-9_-]+\.(?:png|jpe?g|webp))$/iu.exec(item.img_path);
      if (!match || !names.has(match[1]!)) throw new LearningError('invalid-input', 'MinerU media reference is missing or unsafe');
      image = `![Figure](${item.img_path})`;
    }
    const text = [item.text_level ? '#'.repeat(item.text_level) + ' ' + (item.text ?? '') : item.text,
      item.content, image, item.table_body, ...(item.image_caption ?? []), ...(item.image_footnote ?? []),
      ...(item.table_caption ?? []), ...(item.table_footnote ?? []), ...(item.list_items ?? [])].filter(Boolean).join('\n');
    total += Buffer.byteLength(text);
    if (total > Q.generationBytes) throw new LearningError('limit-exceeded', 'MinerU normalized content exceeds limit');
    return { page: item.page_idx + 1, text };
  }).filter(b => b.text.trim());
  if (!blocks.length) throw new LearningError('invalid-input', 'MinerU result has no grounded content');
  return { version: result.version, markdown: file.md_content, blocks, media };
}
export async function awaitMinerU(adapter: DocumentAssetizer, task: MinerUTask, signal: AbortSignal, pollMs = 2000): Promise<void> {
  while (task.status === 'pending' || task.status === 'processing') { await delay(pollMs, undefined, { signal }); task = await adapter.status(task.task_id, signal); }
  if (task.status !== 'completed') throw new MinerUTaskTerminalError();
}
