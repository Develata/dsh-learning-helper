import type { SourceChunk } from './evidence.js';
import { EVIDENCE_LIMITS as L } from './evidence.js';

/** Validate contiguous normalized text provenance, including split long lines. */
export function validateTextLocators(chunks: SourceChunk[]): void {
  let line = 1; let column = 1;
  for (const chunk of chunks) {
      const loc = chunk.locator;
      if (loc.kind !== 'text' || loc.startLine !== line || loc.startColumn !== column) throw new Error('Evidence locator start mismatch');
      // A trailing newline belongs to the preceding line in the displayed range.
      const beforeEnd = chunk.text.endsWith('\n') ? chunk.text.slice(0, -1) : chunk.text;
      const parts = beforeEnd.split('\n');
      const endLine = line + parts.length - 1;
      const endColumn = (parts.length === 1 ? column : 1) + parts.at(-1)!.length + (chunk.text.endsWith('\n') ? 1 : 0);
      if (loc.endLine !== endLine || loc.endColumn !== endColumn || endLine - line >= L.chunkLines) throw new Error('Evidence locator end mismatch');
      if (chunk.text.endsWith('\n')) { line = endLine + 1; column = 1; }
      else { line = endLine; column = endColumn; }
  }
}
