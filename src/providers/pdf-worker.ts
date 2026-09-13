import { parentPort, workerData } from 'node:worker_threads';
import { getDocument, OPS } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { TextItem } from 'pdfjs-dist/types/src/display/api.js';

interface Input { bytes: Uint8Array; pages?: number[] }
const input = workerData as Input;
const pdfHome = dirname(createRequire(import.meta.url).resolve('pdfjs-dist/package.json'));
async function run() {
  const loading = getDocument({ data: input.bytes, useSystemFonts: false,
    standardFontDataUrl: join(pdfHome, 'standard_fonts/'), cMapUrl: join(pdfHome, 'cmaps/'), cMapPacked: true,
    wasmUrl: join(pdfHome, 'wasm/'), stopAtErrors: true, verbosity: 0 });
  const document = await loading.promise;
  try {
    if (document.numPages > 2000) throw new Error('PDF page limit exceeded');
    if (input.pages) {
      if (input.pages.length < 1 || input.pages.length > 4 || input.pages.some(p => !Number.isInteger(p) || p < 1 || p > document.numPages)) throw new Error('Invalid PDF pages');
      const images = [];
      for (const number of input.pages) {
        const page = await document.getPage(number); const initial = page.getViewport({ scale: 1 });
        const scale = Math.min(2, 1600 / Math.max(initial.width, initial.height), Math.sqrt(2_000_000 / (initial.width * initial.height)));
        const viewport = page.getViewport({ scale });
        const factory = document.canvasFactory as { create(w: number, h: number): { canvas: HTMLCanvasElement & { toBuffer(type: 'image/png'): Uint8Array }; context: CanvasRenderingContext2D }; destroy(value: unknown): void };
        const canvas = factory.create(Math.ceil(viewport.width), Math.ceil(viewport.height));
        try {
          await page.render({ canvas: canvas.canvas, canvasContext: canvas.context, viewport }).promise;
          const bytes = new Uint8Array(canvas.canvas.toBuffer('image/png'));
          if (bytes.byteLength > 4 * 1024 * 1024) throw new Error('Rendered PDF page exceeds image byte limit');
          images.push({ page: number, width: canvas.canvas.width, height: canvas.canvas.height, bytes });
        } finally { factory.destroy(canvas); page.cleanup(); }
      }
      return { pageCount: document.numPages, images };
    }
    const pages = []; let size = 0;
    const imageOps = new Set<number>([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject]);
    for (let number = 1; number <= document.numPages; number++) {
      const page = await document.getPage(number); const content = await page.getTextContent();
      const items = content.items.filter((i): i is TextItem => 'str' in i);
      let text = ''; let previousY: number | undefined;
      for (const item of items) {
        const y = item.transform[5] as number;
        if (previousY !== undefined && Math.abs(previousY - y) > 2 && text && !text.endsWith('\n')) text += '\n';
        text += item.str + (item.hasEOL ? '\n' : ' '); previousY = y;
      }
      text = text.trim(); size += Buffer.byteLength(text);
      if (size > 8 * 1024 * 1024) throw new Error('Extracted PDF text exceeds generation byte limit');
      const operators = await page.getOperatorList();
      const images = operators.fnArray.filter(op => imageOps.has(op)).length;
      const glyphs = items.filter(i => i.str.trim().length === 1).length;
      const reasons = [];
      if (text.length < 40 && (images > 0 || operators.fnArray.length > 5)) reasons.push('low-text');
      if (images > 2) reasons.push('image-complexity');
      if (items.length > 40 && glyphs / items.length > 0.6) reasons.push('isolated-glyphs');
      pages.push({ page: number, text, reasons }); page.cleanup();
    }
    return { pageCount: document.numPages, pages };
  } finally { await loading.destroy(); }
}
void run().then(value => parentPort!.postMessage({ ok: true, value }), error => parentPort!.postMessage({ ok: false,
  error: error instanceof Error && /limit|Invalid PDF pages/.test(error.message) ? error.message : 'PDF extraction failed; unsupported, encrypted or malformed document' }));
