import { fromBuffer } from 'yauzl';
import type { ZipFile, Entry } from 'yauzl';
import { crc32 } from 'node:zlib';
import { LearningError } from '../domain/errors.js';
import { WORKSPACE_LIMITS as Q } from '../domain/assets.js';
import { parseMinerUResult } from './mineru.js';
import type { MinerUOutput } from './mineru.js';

/** Read selected files in memory with streamed decompression; never extract archive paths to disk. */
export async function readMinerUZip(bytes: Buffer, pageCount: number, model: string, signal: AbortSignal): Promise<MinerUOutput> {
  signal.throwIfAborted();
  if (bytes.length > 128 * 1024 * 1024) throw new LearningError('limit-exceeded', 'MinerU ZIP exceeds limit');
  const zip = await new Promise<ZipFile>((resolve, reject) => fromBuffer(bytes, { lazyEntries: true, strictFileNames: true, validateEntrySizes: true },
    (error, file) => error ? reject(new LearningError('invalid-input', 'Invalid MinerU ZIP')) : resolve(file)));
  let markdown: string | undefined; let content: string | undefined; let parent: string | undefined;
  const images: Record<string, string> = {}; const paths = new Set<string>(); let expanded = 0; let mediaBytes = 0;
  const decode = (data: Buffer) => new TextDecoder('utf-8', { fatal: true }).decode(data);
  try {
    if (zip.entryCount > 1024) throw new LearningError('limit-exceeded', 'Too many MinerU ZIP entries');
    await new Promise<void>((resolve, reject) => {
      let settled = false; let stream: import('node:stream').Readable | undefined;
      const finish = (error?: unknown) => {
        if (settled) return; settled = true; signal.removeEventListener('abort', abort); stream?.destroy(); zip.close();
        error ? reject(error instanceof LearningError ? error : new LearningError('invalid-input', 'Invalid or interrupted MinerU ZIP')) : resolve();
      };
      const abort = () => finish(new LearningError('unavailable', 'MinerU ZIP reading cancelled'));
      signal.addEventListener('abort', abort, { once: true });
      zip.on('error', finish); zip.on('end', () => finish());
      zip.on('entry', (entry: Entry) => { void (async () => {
        signal.throwIfAborted(); const name = entry.fileName;
        if (name.length > 300 || name.includes('\\') || name.startsWith('/') || name.split('/').some(s => s === '..' || s === '.') || /[\x00-\x1f]/.test(name)
          || paths.has(name) || ((entry.externalFileAttributes >>> 16) & 0xf000) === 0xa000 || entry.isEncrypted())
          throw new LearningError('invalid-input', 'Unsafe MinerU ZIP entry');
        paths.add(name);
        const md = /(?:^|\/)full\.md$/.test(name);
        const json = /(?:^|\/)(?:[^/]+_)?content_list\.json$/.test(name);
        const media = /(?:^|\/)images\/([a-zA-Z0-9_-]{1,160}\.(png|jpe?g|webp))$/i.exec(name);
        if (!md && !json && !media) { zip.readEntry(); return; }
        const prefix = name.slice(0, md ? -'full.md'.length : json ? name.lastIndexOf('/') + 1 : name.lastIndexOf('images/'));
        if (parent === undefined) parent = prefix; else if (prefix !== parent) throw new LearningError('invalid-input', 'Mixed MinerU document roots');
        const max = md ? Q.generationBytes : json ? 16 * 1024 * 1024 : Q.mediaBytes - mediaBytes;
        if (entry.uncompressedSize > max || expanded + entry.uncompressedSize > Q.mediaBytes + Q.generationBytes + 16 * 1024 * 1024)
          throw new LearningError('limit-exceeded', 'MinerU ZIP expanded size exceeded');
        if ((md && markdown !== undefined) || (json && content !== undefined) || (media && Object.keys(images).length >= Q.mediaFiles))
          throw new LearningError('invalid-input', 'Unexpected MinerU ZIP file count');
        stream = await new Promise<import('node:stream').Readable>((r, j) => zip.openReadStream(entry, (e, s) => e ? j(e) : r(s)));
        if (settled) { stream.destroy(); return; }
        const chunks: Buffer[] = []; let size = 0; let checksum = 0;
        for await (const value of stream) {
          signal.throwIfAborted(); const chunk = Buffer.from(value); size += chunk.length; checksum = crc32(chunk, checksum);
          if (size > max || size > entry.uncompressedSize) throw new LearningError('limit-exceeded', 'MinerU ZIP expanded size exceeded'); chunks.push(chunk);
        }
        stream = undefined;
        if (size !== entry.uncompressedSize || checksum !== entry.crc32) throw new LearningError('invalid-input', 'MinerU ZIP checksum mismatch');
        const data = Buffer.concat(chunks, size); expanded += size;
        if (md) markdown = decode(data); else if (json) content = decode(data); else if (media) {
          mediaBytes += size; const ext = media[2]!.toLowerCase();
          images[media[1]!] = `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${data.toString('base64')}`;
        }
        if (!settled) zip.readEntry();
      })().catch(finish); });
      if (signal.aborted) abort(); else zip.readEntry();
    });
    if (markdown === undefined || content === undefined) throw new LearningError('invalid-input', 'MinerU ZIP lacks Markdown or page provenance');
    return parseMinerUResult({ version: `cloud-v4-${model}`, results: { document: { md_content: markdown, content_list: content, images } } }, pageCount);
  } finally { zip.close(); }
}
