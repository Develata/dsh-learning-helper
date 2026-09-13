import test from 'node:test';
import assert from 'node:assert/strict';
import { PdfParser } from '../src/providers/pdf-parser.js';
import { makePdf } from './pdf-fixture.js';

test('real PDF.js extracts pages deterministically and identifies image-only pages for vision', { timeout: 30_000 }, async () => {
  const parser = new PdfParser(); const signal = new AbortController().signal;
  const bytes = makePdf([{ text: 'Uniform continuity: for every epsilon > 0 there is a delta > 0 independent of x.' },
    { text: 'Heine-Cantor: continuous functions on a compact interval are uniformly continuous.' }, { image: true }]);
  const first = await parser.parse(bytes, signal); const second = await parser.parse(bytes, signal);
  assert.deepEqual(first, second); assert.equal(first.pageCount, 3);
  assert.match(first.pages[0]!.text, /epsilon/); assert.deepEqual(first.pages[0]!.reasons, []);
  assert.match(first.pages[1]!.text, /Heine-Cantor/);
  assert.equal(first.pages[2]!.text, ''); assert.ok(first.pages[2]!.reasons.includes('low-text'));
  const images = await parser.render(bytes, [1, 3], signal);
  assert.deepEqual(images.map(i => i.page), [1, 3]);
  for (const image of images) { assert.deepEqual([...image.bytes.subarray(0, 4)], [137, 80, 78, 71]); assert.ok(image.width * image.height <= 2_005_000); }
  await assert.rejects(parser.render(bytes, [4], signal), /Invalid PDF pages/);
});

test('PDF cancellation, page/output bounds and malformed input fail explicitly', async () => {
  const parser = new PdfParser(); const bytes = makePdf([{ text: 'a' }]);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(parser.parse(bytes, cancelled.signal), { name: 'AbortError' });
  const signal = new AbortController().signal;
  await assert.rejects(parser.parse(Buffer.from('not a PDF file'), signal), { code: 'invalid-input' });
  await assert.rejects(parser.parse(Buffer.alloc(64 * 1024 * 1024 + 1), signal), { code: 'invalid-input' });
  await assert.rejects(parser.render(bytes, [1, 2, 3, 4, 5], signal), { code: 'invalid-input' });
  await assert.rejects(parser.render(bytes, [1, 1], signal), { code: 'invalid-input' });
});
