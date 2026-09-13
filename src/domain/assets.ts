import { z } from 'zod';
import { sourceIdSchema, sourceChunkSchema } from './evidence.js';
import { idSchema } from './model.js';

export const WORKSPACE_LIMITS = {
  sources: 200, sourceWarning: 100, pdfBytes: 64 * 1024 * 1024, pages: 2000,
  archiveBinaryBytes: 2 * 1024 * 1024 * 1024,
  canonicalTextBytes: 64 * 1024 * 1024, indexedTextBytes: 64 * 1024 * 1024,
  generationBytes: 8 * 1024 * 1024, generationChunks: 8192, generationsPerSource: 10,
  mediaBytes: 64 * 1024 * 1024, mediaFiles: 256,
} as const;
export const pdfModeSchema = z.enum(['local-fast', 'auto', 'high-accuracy']);
export type PdfMode = z.infer<typeof pdfModeSchema>;
export const relativePathSchema = z.string().min(1).max(500).refine(s => !s.startsWith('/') && !s.includes('\\') && !/[\x00-\x1f]/u.test(s)
  && s.split('/').every(p => p !== '' && p !== '.' && p !== '..'), 'Unsafe asset path');
export const generationSchema = z.strictObject({ id: idSchema, sourceId: sourceIdSchema,
  parser: z.string().min(1).max(80), createdAt: z.iso.datetime(), canonicalAsset: relativePathSchema,
  textBytes: z.number().int().min(1).max(WORKSPACE_LIMITS.generationBytes),
  chunkCount: z.number().int().min(1).max(WORKSPACE_LIMITS.generationChunks),
});
export type AssetGeneration = z.infer<typeof generationSchema>;
export const generationChunkSchema = sourceChunkSchema;
export const originalReadSchema = z.strictObject({ sourceId: sourceIdSchema,
  pages: z.array(z.number().int().min(1).max(WORKSPACE_LIMITS.pages)).min(1).max(4).refine(p => new Set(p).size === p.length, 'Duplicate pages'),
  reason: z.enum(['verify-formula', 'inspect-figure', 'inspect-layout', 'resolve-extraction-ambiguity', 'missing-derived-content', 'verify-citation']),
});
