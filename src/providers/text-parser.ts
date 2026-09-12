import { setImmediate } from 'node:timers/promises';
import { EVIDENCE_LIMITS as L, textWindow } from '../domain/evidence.js';
import type { ParsedChunk, TextImport } from '../domain/evidence.js';
import type { DocumentParser } from '../services/evidence.js';
import { LearningError } from '../domain/errors.js';

/** Deterministic, lossless chunks; text columns are one-based UTF-16 positions, end exclusive. */
export class TextParser implements DocumentParser {
  readonly id = 'text-v1';
  async parse(input: TextImport, signal: AbortSignal): Promise<ParsedChunk[]> {
    const chunks: ParsedChunk[] = []; let section: string | undefined;
    let buffer = ''; let startLine = 1; let startColumn = 1; let endLine = 1; let endColumn = 1;
    const flush = () => {
      if (!buffer) return;
      if (chunks.length >= L.chunks) throw new LearningError('limit-exceeded', 'Source exceeds 512 chunks');
      chunks.push({ ordinal: chunks.length, text: buffer, locator: { kind: 'text', startLine, endLine, startColumn, endColumn,
        ...(section === undefined ? {} : { section }) } }); buffer = '';
    };
    const lines = input.text.split('\n'); let fence: string | undefined;
    for (let i = 0; i < lines.length; i++) {
      if (i % 64 === 0) { await setImmediate(undefined, { signal }); }
      signal.throwIfAborted();
      const line = lines[i]!; const number = i + 1;
      const marker = input.mimeType === 'text/markdown' ? /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]?.[0] : undefined;
      const heading = input.mimeType === 'text/markdown' && !fence ? /^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/.exec(line)?.[1] : undefined;
      if (heading) { flush(); section = textWindow(heading, 0, 200); }
      if (marker) fence = fence === marker ? undefined : fence ?? marker;
      const piece = line + (i < lines.length - 1 ? '\n' : '');
      let offset = 0;
      while (offset < piece.length) {
        if (buffer && number - startLine >= L.chunkLines) flush();
        if (!buffer) { startLine = number; startColumn = offset + 1; }
        let take = Math.min(L.chunkChars - buffer.length, piece.length - offset);
        const last = piece.charCodeAt(offset + take - 1);
        if (last >= 0xd800 && last <= 0xdbff) take--;
        if (take === 0) { flush(); continue; }
        buffer += piece.slice(offset, offset + take); offset += take;
        endLine = number; endColumn = offset + 1;
        if (buffer.length >= L.chunkChars || offset < piece.length) flush();
      }
    }
    flush(); signal.throwIfAborted(); return chunks;
  }
}
