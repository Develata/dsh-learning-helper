import { Worker } from 'node:worker_threads';
import { z } from 'zod';
import { LearningError } from '../domain/errors.js';
import { WORKSPACE_LIMITS as Q } from '../domain/assets.js';
import { validate } from '../services/evidence.js';

export const parsedPageSchema = z.strictObject({ page: z.number().int().positive().max(Q.pages), text: z.string().max(Q.generationBytes)
  .refine(t => t.isWellFormed() && !t.includes('\0'), 'Invalid page text'), reasons: z.array(z.enum(['low-text', 'image-complexity', 'isolated-glyphs'])).max(3) });
export type ParsedPage = z.infer<typeof parsedPageSchema>;
export interface PageImage { page: number; width: number; height: number; bytes: Uint8Array }
const documentSchema = z.strictObject({ pageCount: z.number().int().positive().max(Q.pages), pages: z.array(parsedPageSchema).max(Q.pages) })
  .refine(d => d.pages.length === d.pageCount && d.pages.every((p, i) => p.page === i + 1), 'Page identity mismatch');
let activeWorkers = 0;
/** Worker termination bounds untrusted CPU work as well as cooperative cancellation. No main-thread PDF parsing. */
async function worker(bytes: Uint8Array, signal: AbortSignal, pages?: number[]): Promise<unknown> {
  signal.throwIfAborted();
  if (bytes.byteLength > Q.pdfBytes || bytes.byteLength < 8 || !Buffer.from(bytes.subarray(0, 1024)).includes('%PDF-')) throw new LearningError('invalid-input', 'Use a PDF of at most 64 MiB');
  if (activeWorkers >= 2) throw new LearningError('unavailable', 'Two PDF operations are active; retry later');
  activeWorkers++;
  const data = Uint8Array.from(bytes);
  const extension = import.meta.url.endsWith('.ts') ? 'ts' : 'js';
  let instance: Worker | undefined;
  try {
    instance = new Worker(new URL(`./pdf-worker.${extension}`, import.meta.url), { workerData: { bytes: data, ...(pages ? { pages } : {}) },
      transferList: [data.buffer], resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64 },
      ...(extension === 'ts' ? { execArgv: ['--experimental-strip-types'] } : {}) });
    const current = instance;
    return await new Promise((resolve, reject) => {
      const abort = () => { cleanup(); reject(signal.reason); };
      const timer = setTimeout(() => { cleanup(); reject(new LearningError('unavailable', 'PDF operation timed out')); }, 120_000);
      const cleanup = () => { clearTimeout(timer); signal.removeEventListener('abort', abort); };
      signal.addEventListener('abort', abort, { once: true });
      current.once('message', (result: { ok: boolean; value?: unknown; error?: string }) => { cleanup(); result.ok ? resolve(result.value) : reject(new LearningError('invalid-input', result.error ?? 'PDF extraction failed')); });
      current.once('error', () => { cleanup(); reject(new LearningError('unavailable', 'PDF worker failed')); });
      current.once('exit', () => { cleanup(); reject(new LearningError('unavailable', 'PDF worker stopped')); });
      if (signal.aborted) abort();
    });
  } finally { if (instance) await instance.terminate(); activeWorkers--; }
}
export class PdfParser {
  readonly id = 'pdfjs-6.3.289';
  async parse(bytes: Uint8Array, signal: AbortSignal) { return validate(documentSchema, await worker(bytes, signal)); }
  async render(bytes: Uint8Array, pages: number[], signal: AbortSignal): Promise<PageImage[]> {
    if (pages.length < 1 || pages.length > 4 || new Set(pages).size !== pages.length || pages.some(p => !Number.isInteger(p) || p < 1 || p > Q.pages)) throw new LearningError('invalid-input', 'Read 1–4 unique existing PDF pages');
    const result = await worker(bytes, signal, pages) as { images: PageImage[] };
    if (!Array.isArray(result.images) || result.images.length !== pages.length || result.images.some((image, i) => image.page !== pages[i] || !(image.bytes instanceof Uint8Array))) throw new LearningError('unavailable', 'Invalid PDF rendering result');
    return result.images;
  }
}
