import { z } from 'zod';
import { idSchema } from './model.js';

export const EVIDENCE_LIMITS = { sourceBytes: 512 * 1024, chunks: 512, chunkChars: 4000, chunkLines: 80,
  sources: 32, courseBytes: 8 * 1024 * 1024, queryChars: 200, searchResults: 20,
  readChunks: 8, readChars: 24_000, excerptChars: 500, importConcurrency: 8, parserMs: 5000,
  sourceBodyBytes: 4 * 1024 * 1024 } as const;
export const sourceIdSchema = z.string().regex(/^src_[a-f0-9]{64}$/);
export const chunkIdSchema = z.string().regex(/^chk_[a-f0-9]{64}$/);
export const filenameSchema = z.string().min(1).max(200).regex(/^[^\x00-\x1f\x7f/\\]+$/).refine(s => s !== '.' && s !== '..' && s.isWellFormed(), 'Invalid filename');
export const textImportSchema = z.strictObject({ filename: filenameSchema,
  mimeType: z.enum(['text/plain', 'text/markdown']), text: z.string().min(1).max(EVIDENCE_LIMITS.sourceBytes) });
export const textLocatorSchema = z.strictObject({ kind: z.literal('text'), section: z.string().max(200).optional(),
  startLine: z.number().int().positive(), endLine: z.number().int().positive(),
  startColumn: z.number().int().positive(), endColumn: z.number().int().positive() });
export const locatorSchema = z.discriminatedUnion('kind', [textLocatorSchema,
  z.strictObject({ kind: z.literal('pdf'), page: z.number().int().positive(), block: z.number().int().nonnegative() })]);
export const sourceSchema = z.strictObject({ id: sourceIdSchema, courseId: idSchema, filename: filenameSchema,
  mimeType: z.enum(['text/plain', 'text/markdown', 'application/pdf']), contentHash: z.string().regex(/^[a-f0-9]{64}$/),
  parser: z.string().min(1).max(80), status: z.enum(['processing', 'ready', 'failed']),
  byteSize: z.number().int().min(1).max(64 * 1024 * 1024),
  chunkCount: z.number().int().min(0).max(8192), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
  pageCount: z.number().int().min(1).max(2000).optional(),
  activeGenerationId: idSchema.optional(), canonicalAsset: z.string().max(500).optional(), originalAsset: z.string().max(500).optional(),
  assetization: z.enum(['idle', 'processing', 'ready', 'failed', 'outcome-unknown']).optional(),
  parseMode: z.enum(['local-fast', 'auto', 'high-accuracy']).optional(),
  parsing: z.enum(['processing', 'ready', 'failed']).optional(),
  parseWarning: z.enum(['vision-unavailable', 'vision-failed', 'no-extracted-text']).optional(),
  errorCode: z.enum(['interrupted', 'parse-failed', 'cancelled', 'timeout', 'limit-exceeded']).optional() })
  .refine(s => s.status === 'ready' ? s.chunkCount > 0 && s.errorCode === undefined
    : s.chunkCount === 0 && (s.status === 'failed' ? s.errorCode !== undefined : s.errorCode === undefined), 'Invalid source lifecycle state');
export const parsedChunkSchema = z.strictObject({ ordinal: z.number().int().nonnegative(),
  text: z.string().min(1).max(EVIDENCE_LIMITS.chunkChars), locator: locatorSchema });
export const sourceChunkSchema = parsedChunkSchema.extend({ id: chunkIdSchema, sourceId: sourceIdSchema, courseId: idSchema });
export const searchArgsSchema = z.strictObject({ courseId: idSchema, query: z.string().trim().min(1).max(EVIDENCE_LIMITS.queryChars),
  limit: z.number().int().min(1).max(EVIDENCE_LIMITS.searchResults).default(5) });
export const readArgsSchema = z.strictObject({ courseId: idSchema,
  chunkIds: z.array(chunkIdSchema).min(1).max(EVIDENCE_LIMITS.readChunks).refine(xs => new Set(xs).size === xs.length, 'Duplicate chunk ids') });
export type Source = z.infer<typeof sourceSchema>;
export type SourceChunk = z.infer<typeof sourceChunkSchema>;
export type ParsedChunk = z.infer<typeof parsedChunkSchema>;
export type TextImport = z.infer<typeof textImportSchema>;
export type Locator = z.infer<typeof locatorSchema>;
export interface Citation { chunkId: string; sourceId: string; filename: string; locator: Locator; canonicalRef: string; citationLabel: string }
export interface EvidenceRead extends Citation { text: string }
export interface EvidenceHit extends Citation { score: number; excerpt: string }

/** A bounded UTF-16 window without incomplete Unicode code points. */
export function textWindow(text: string, start: number, size: number): string {
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start] ?? '')) start++;
  let end = Math.min(text.length, start + size);
  if (end > start && /[\uD800-\uDBFF]/.test(text[end - 1]!)) end--;
  return text.slice(start, end);
}
