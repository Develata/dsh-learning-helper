import { z } from 'zod';
import { LearningError } from '../domain/errors.js';
import { WORKSPACE_LIMITS as Q } from '../domain/assets.js';
import { validate } from '../services/evidence.js';
import { readMinerUZip } from './mineru-zip.js';
import { MinerUTaskTerminalError, UnknownMinerUSubmission } from './mineru.js';
import type { DocumentAssetizer, MinerUOutput, MinerUTask } from './mineru.js';

const API = 'https://mineru.net/api/v4';
const idSchema = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const resultSchema = z.object({ batch_id: idSchema, extract_result: z.array(z.object({
  file_name: z.literal('document.pdf'), data_id: z.literal('learning-helper-document'),
  state: z.enum(['waiting-file', 'pending', 'running', 'converting', 'done', 'failed']),
  full_zip_url: z.string().max(8192).optional(),
})).length(1) });

/** Only official object-storage URLs may receive PDF bytes or supply result ZIPs. No API token leaves mineru.net. */
export function cloudAssetUrl(value: string, kind: 'upload' | 'result'): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new LearningError('invalid-input', 'Invalid MinerU cloud asset URL'); }
  const hosts = kind === 'upload' ? ['mineru.oss-cn-shanghai.aliyuncs.com'] : ['cdn-mineru.openxlab.org.cn', 'mineru.oss-cn-shanghai.aliyuncs.com'];
  if (value.length > 8192 || url.protocol !== 'https:' || !hosts.includes(url.hostname) || url.port || url.username || url.password || url.hash)
    throw new LearningError('invalid-input', 'Untrusted MinerU cloud asset URL');
  return url.href;
}

/** Official SaaS v4: allocate one upload URL, PUT once, poll batch, download bounded ZIP. */
export class MinerUCloudAssetizer implements DocumentAssetizer {
  constructor(private readonly token: string, private readonly model: 'vlm' | 'pipeline' = 'vlm', private readonly transport: typeof fetch = fetch) {
    if (!/^[!-~]{1,8192}$/.test(token)) throw new LearningError('unavailable', 'Configure the MinerU cloud API key first');
  }
  async health(signal: AbortSignal): Promise<void> {
    // SaaS has no protocol-2 health endpoint. Authentication is checked by the first task request.
    signal.throwIfAborted();
  }
  private async bytes(url: string, init: RequestInit, signal: AbortSignal, max: number, timeout = 30_000): Promise<{ status: number; bytes: Buffer }> {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(timeout)]);
    try {
      const response = await this.transport(url, { ...init, redirect: 'error', signal: bounded });
      if (!response.body) return { status: response.status, bytes: Buffer.alloc(0) };
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      try {
        if (Number(response.headers.get('content-length')) > max) throw new LearningError('limit-exceeded', 'MinerU response exceeds limit');
        while (true) {
          bounded.throwIfAborted(); const { done, value } = await reader.read(); if (done) break;
          size += value.length; if (size > max) throw new LearningError('limit-exceeded', 'MinerU response exceeds limit'); chunks.push(value);
        }
        return { status: response.status, bytes: Buffer.concat(chunks, size) };
      } finally { await reader.cancel().catch(() => undefined); reader.releaseLock(); }
    } catch (error) {
      if (error instanceof LearningError) throw error;
      // Fetch/stream diagnostics may contain signed object-storage URLs; do not forward them to Host logs.
      throw new LearningError('unavailable', 'MinerU cloud request failed or timed out');
    }
  }
  private async api(path: string, signal: AbortSignal, body?: unknown): Promise<unknown> {
    const response = await this.bytes(API + path, { method: body ? 'POST' : 'GET',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }, signal, 256 * 1024);
    if (response.status >= 400 && response.status < 500) throw new LearningError('invalid-input', 'MinerU cloud rejected the request; check API key, expiry and quota');
    if (response.status !== 200) throw new LearningError('unavailable', 'MinerU cloud temporarily unavailable');
    let json: unknown;
    try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(response.bytes)); }
    catch { throw new LearningError('unavailable', 'Invalid MinerU cloud response'); }
    const envelope = validate(z.object({ code: z.number().int(), data: z.unknown().optional() }), json);
    if (!body && envelope.code === -60012) throw new MinerUTaskTerminalError();
    if (envelope.code !== 0) throw new LearningError('invalid-input', 'MinerU cloud rejected the request; check API key, expiry and quota');
    return envelope.data;
  }
  async submit(bytes: Uint8Array, signal: AbortSignal): Promise<MinerUTask> {
    signal.throwIfAborted(); if (bytes.length > Q.pdfBytes) throw new LearningError('limit-exceeded', 'PDF exceeds limit');
    let data: unknown;
    try { data = await this.api('/file-urls/batch', signal, { files: [{ name: 'document.pdf', data_id: 'learning-helper-document' }],
      model_version: this.model, enable_formula: true, enable_table: true, language: 'ch' }); }
    catch (error) { if (error instanceof LearningError && error.code === 'invalid-input') throw error; throw new UnknownMinerUSubmission(); }
    // Any failure after allocation can leave a remote task. Never hide this with automatic resubmission.
    try {
      const allocated = validate(z.object({ batch_id: idSchema, file_urls: z.array(z.string().max(8192)).length(1) }), data);
      const upload = await this.bytes(cloudAssetUrl(allocated.file_urls[0]!, 'upload'), { method: 'PUT', body: Buffer.from(bytes) }, signal, 64 * 1024, 90_000);
      if (upload.status < 200 || upload.status >= 300) throw new Error('Upload not acknowledged');
      return { task_id: allocated.batch_id, status: 'pending' };
    } catch { throw new UnknownMinerUSubmission(); }
  }
  private async batch(id: string, signal: AbortSignal) {
    validate(idSchema, id);
    const result = validate(resultSchema, await this.api(`/extract-results/batch/${id}`, signal));
    if (result.batch_id !== id) throw new LearningError('invalid-input', 'MinerU batch identity mismatch');
    return result.extract_result[0]!;
  }
  async status(id: string, signal: AbortSignal): Promise<MinerUTask> {
    const result = await this.batch(id, signal);
    return { task_id: id, status: result.state === 'done' ? 'completed' : result.state === 'failed' ? 'failed'
      : ['running', 'converting'].includes(result.state) ? 'processing' : 'pending' };
  }
  async result(id: string, pageCount: number, signal: AbortSignal): Promise<MinerUOutput> {
    const result = await this.batch(id, signal);
    if (result.state === 'failed') throw new MinerUTaskTerminalError();
    if (result.state !== 'done' || !result.full_zip_url) throw new LearningError('unavailable', 'MinerU cloud result is not ready');
    const archive = await this.bytes(cloudAssetUrl(result.full_zip_url, 'result'), {}, signal, 128 * 1024 * 1024, 120_000);
    if (archive.status !== 200) throw new LearningError('unavailable', 'MinerU cloud result download failed');
    return readMinerUZip(archive.bytes, pageCount, this.model, signal);
  }
}
