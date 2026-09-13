import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateTextLocators } from '../domain/evidence-validation.js';
import { DatabaseSync } from 'node:sqlite';
import type { EvidenceStore } from '../services/evidence.js';
import { hashText, chunkIdentity } from '../services/evidence.js';
import { LearningError } from '../domain/errors.js';
import { EVIDENCE_LIMITS as L, sourceSchema, sourceChunkSchema, textWindow } from '../domain/evidence.js';
import type { Source, SourceChunk, EvidenceRead, EvidenceHit } from '../domain/evidence.js';
import { WORKSPACE_LIMITS as Q, generationSchema } from '../domain/assets.js';
import type { AssetGeneration } from '../domain/assets.js';
import { citationFor, supportsFts5 } from './evidence-sqlite.js';
import { workspacePath, workspaceDatabasePath, writeWorkspaceFile } from '../workspace/files.js';

type Row = Record<string, unknown>;
const sourceOf = (row: Row): Source => sourceSchema.parse(JSON.parse(String(row.data)));
const chunkOf = (row: Row): SourceChunk => sourceChunkSchema.parse(JSON.parse(String(row.data)));
export const generationChunkId = (sourceId: string, generationId: string, ordinal: number) =>
  generationId === 'text-v1' ? chunkIdentity(sourceId, ordinal) : `chk_${hashText(`${sourceId}:${generationId}:${ordinal}`)}`;

/** Workspace-owned schema v2. Legacy schema v1 is only handled by the explicit migration command. */
export class WorkspaceEvidenceStore implements EvidenceStore {
  private readonly db: DatabaseSync;
  readonly ftsAvailable: boolean;
  private closed = false;
  private readonly imports = new Set<string>();
  constructor(readonly root: string, readonly projectId: string, options: { fts?: boolean; create?: boolean; databasePath?: string } = {}) {
    const path = workspaceDatabasePath(root, options.databasePath ?? '.learning-helper/evidence.db');
    const existed = existsSync(path);
    if (!existed && !options.create) throw new LearningError('unavailable', 'Workspace evidence database is missing; explicit recovery required');
    this.db = new DatabaseSync(path, { allowExtension: false, enableForeignKeyConstraints: true });
    try {
      this.db.exec('PRAGMA busy_timeout=250');
      const version = Number(this.db.prepare('PRAGMA user_version').get()!['user_version']);
      if (version !== 0 && version !== 2) throw new Error(`Unsupported workspace evidence schema ${version}; explicit migration required`);
      if (version === 0) {
        if (existed) throw new LearningError('unavailable', 'Existing evidence database has no schema; explicit recovery required');
        if (this.db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all().length) throw new Error('Unversioned nonempty evidence database');
        this.db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE owner(project_id TEXT PRIMARY KEY);
          CREATE TABLE sources(id TEXT PRIMARY KEY, hash TEXT UNIQUE NOT NULL, data TEXT NOT NULL, active TEXT);
          CREATE TABLE generations(source_id TEXT NOT NULL REFERENCES sources(id), id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(source_id,id));
          CREATE TABLE generation_slots(source_id TEXT NOT NULL REFERENCES sources(id), id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(source_id,id));
          CREATE TABLE derived_files(path TEXT PRIMARY KEY, bytes INTEGER NOT NULL, hash TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('text','media','canonical')));
          CREATE TABLE chunks(rowid INTEGER PRIMARY KEY, id TEXT UNIQUE NOT NULL, source_id TEXT NOT NULL, generation_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL, text TEXT NOT NULL, data TEXT NOT NULL, UNIQUE(source_id,generation_id,ordinal),
            FOREIGN KEY(source_id,generation_id) REFERENCES generations(source_id,id));
          PRAGMA user_version=2;`);
        this.db.prepare('INSERT INTO owner VALUES(?)').run(projectId);
        this.db.exec('COMMIT');
      }
      const owners = this.db.prepare('SELECT project_id FROM owner').all();
      if (owners.length !== 1 || owners[0]!.project_id !== projectId) throw new Error('Workspace evidence identity mismatch');
      if (Object.values(this.db.prepare('PRAGMA quick_check').get()!)[0] !== 'ok' || this.db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Workspace evidence integrity failed');
      this.ftsAvailable = (options.fts ?? true) && supportsFts5();
      this.verify();
      this.transaction(() => {
        for (const source of this.listSources(projectId)) {
          if (source.status === 'processing') this.writeSource({ ...source, status: 'failed', errorCode: 'interrupted', updatedAt: new Date().toISOString() });
          if (source.parsing === 'processing') this.writeSource({ ...this.getSource(source.id), parsing: 'failed', parseWarning: 'vision-failed', updatedAt: new Date().toISOString() });
          if (source.assetization === 'processing') this.writeSource({ ...this.getSource(source.id), assetization: 'failed', updatedAt: new Date().toISOString() });
        }
        if (this.ftsAvailable) {
          this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, tokenize='unicode61'); CREATE VIRTUAL TABLE IF NOT EXISTS chunks_trigram USING fts5(text, tokenize='trigram'); DELETE FROM chunks_fts; DELETE FROM chunks_trigram;");
          const latin = this.db.prepare('INSERT INTO chunks_fts(rowid,text) VALUES(?,?)');
          const trigram = this.db.prepare('INSERT INTO chunks_trigram(rowid,text) VALUES(?,?)');
          for (const row of this.db.prepare('SELECT c.rowid,c.text FROM chunks c JOIN sources s ON s.id=c.source_id AND s.active=c.generation_id').iterate()) {
            latin.run(Number(row.rowid), String(row.text)); trigram.run(Number(row.rowid), String(row.text));
          }
        }
      });
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=4194304;');
    } catch (error) { this.db.close(); throw error; }
  }
  private check(owner = this.projectId): void {
    if (this.closed) throw new LearningError('closed', 'Workspace evidence closed');
    if (owner !== this.projectId) throw new LearningError('not-found', 'Evidence not found in this Workspace');
  }
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private writeSource(source: Source): void {
    sourceSchema.parse(source);
    this.db.prepare('UPDATE sources SET data=?,active=? WHERE id=?').run(JSON.stringify(source), source.activeGenerationId ?? null, source.id);
  }
  getSource(id: string): Source {
    this.check(); const row = this.db.prepare('SELECT * FROM sources WHERE id=?').get(id);
    if (!row) throw new LearningError('not-found', 'Source not found in this Workspace'); return sourceOf(row);
  }
  listSources(owner: string): Source[] { this.check(owner); return this.db.prepare('SELECT * FROM sources ORDER BY id').all().map(sourceOf); }
  generations(sourceId: string): AssetGeneration[] {
    this.getSource(sourceId);
    return this.db.prepare('SELECT data FROM generations WHERE source_id=? ORDER BY id').all(sourceId).map(r => generationSchema.parse(JSON.parse(String(r.data))));
  }
  reserveGeneration(sourceId: string, generationId: string): string {
    this.getSource(sourceId); generationSchema.shape.id.parse(generationId);
    return this.transaction(() => {
      const previous = this.db.prepare('SELECT created_at FROM generation_slots WHERE source_id=? AND id=?').get(sourceId, generationId);
      if (previous) return String(previous.created_at);
      const count = Number(this.db.prepare('SELECT count(*) AS n FROM generation_slots WHERE source_id=?').get(sourceId)!.n);
      if (count >= Q.generationsPerSource) throw new LearningError('limit-exceeded', 'Source has reached its 10 generation attempts; existing evidence remains available');
      const created = new Date().toISOString();
      this.db.prepare('INSERT INTO generation_slots VALUES(?,?,?)').run(sourceId, generationId, created); return created;
    });
  }
  /** Reserve bounded derived storage BEFORE writing. Failed writes are retryable at the same identity. */
  writeDerived(sourceId: string, generationId: string, name: string, bytes: string | Uint8Array, kind: 'text' | 'media' = 'text'): string {
    this.reserveGeneration(sourceId, generationId);
    if (!/^[a-zA-Z0-9_.-]{1,180}$/u.test(name) || name === '.' || name === '..') throw new LearningError('invalid-input', 'Invalid generation filename');
    const path = kind === 'media' ? `learning-assets/media/${sourceId}/${generationId}/${name}` : `.learning-helper/generations/${sourceId}/${generationId}/${name}`;
    return this.writeAsset(path, bytes, kind);
  }
  private writeAsset(path: string, bytes: string | Uint8Array, kind: 'text' | 'media' | 'canonical'): string {
    const buffer = typeof bytes === 'string' ? Buffer.from(bytes) : Buffer.from(bytes); const hash = createHash('sha256').update(buffer).digest('hex');
    this.transaction(() => {
      const previous = this.db.prepare('SELECT hash,bytes FROM derived_files WHERE path=?').get(path);
      if (previous) { if (previous.hash !== hash || previous.bytes !== buffer.length) throw new LearningError('conflict', 'Derived artifact identity changed'); return; }
      const total = Number(this.db.prepare('SELECT coalesce(sum(bytes),0) AS n FROM derived_files WHERE kind=?').get(kind)!.n);
      const count = Number(this.db.prepare('SELECT count(*) AS n FROM derived_files').get()!.n);
      if (total + buffer.length > (kind === 'media' ? Q.mediaBytes : Q.canonicalTextBytes) || count >= 10_000) throw new LearningError('limit-exceeded', 'Workspace derived asset quota exceeded');
      this.db.prepare('INSERT INTO derived_files VALUES(?,?,?,?)').run(path, buffer.length, hash, kind);
    });
    writeWorkspaceFile(this.root, path, bytes); return path;
  }
  usage() {
    const sources = this.listSources(this.projectId);
    const textBytes = Number(this.db.prepare("SELECT coalesce(sum(json_extract(data,'$.textBytes')),0) AS n FROM generations").get()!.n);
    return { sourceCount: sources.length, archiveBinaryBytes: sources.filter(s => s.mimeType === 'application/pdf').reduce((n, s) => n + s.byteSize, 0),
      canonicalTextBytes: Number(this.db.prepare("SELECT coalesce(sum(bytes),0) AS n FROM derived_files WHERE kind='canonical'").get()!.n), indexedTextBytes: textBytes };
  }
  private verify(): void {
    const usage = this.usage();
    if (usage.sourceCount > Q.sources || usage.archiveBinaryBytes > Q.archiveBinaryBytes || usage.canonicalTextBytes > Q.canonicalTextBytes || usage.indexedTextBytes > Q.indexedTextBytes) throw new Error('Workspace evidence quota exceeded');
    for (const row of this.db.prepare('SELECT kind,sum(bytes) AS bytes,count(*) AS n FROM derived_files GROUP BY kind').all()) {
      if (Number(row.bytes) > (row.kind === 'media' ? Q.mediaBytes : Q.canonicalTextBytes) || Number(row.n) > 10_000) throw new Error('Derived artifact quota exceeded');
    }
    for (const row of this.db.prepare('SELECT * FROM derived_files').iterate()) {
      workspacePath(this.root, String(row.path));
      if (!Number.isSafeInteger(row.bytes) || Number(row.bytes) < 0 || !/^[a-f0-9]{64}$/.test(String(row.hash))) throw new Error('Invalid derived artifact reservation');
    }
    for (const row of this.db.prepare('SELECT source_id,count(*) AS n FROM generation_slots GROUP BY source_id').all()) {
      if (Number(row.n) > Q.generationsPerSource) throw new Error('Generation reservation quota exceeded');
    }
    for (const row of this.db.prepare('SELECT * FROM sources').iterate()) {
      const source = sourceOf(row);
      if (source.id !== row.id || source.contentHash !== row.hash || source.courseId !== this.projectId
        || source.id !== `src_${hashText(`${this.projectId}:${source.contentHash}`)}` || (source.activeGenerationId ?? null) !== row.active) throw new Error('Workspace source identity mismatch');
      if (source.originalAsset) workspacePath(this.root, source.originalAsset);
      const generations = this.generations(source.id);
      if (generations.length > Q.generationsPerSource) throw new Error('Generation quota exceeded');
      if (source.status === 'ready' && !generations.some(g => g.id === source.activeGenerationId && g.chunkCount === source.chunkCount)) throw new Error('Active generation missing');
      for (const g of generations) {
        workspacePath(this.root, g.canonicalAsset);
        const chunks = this.db.prepare('SELECT * FROM chunks WHERE source_id=? AND generation_id=? ORDER BY ordinal').all(source.id, g.id);
        const values = chunks.map(row => { const chunk = chunkOf(row); if (chunk.id !== row.id || chunk.text !== row.text || chunk.ordinal !== row.ordinal) throw new Error('Chunk projection mismatch'); return chunk; });
        this.validateGeneration(source, g, values);
      }
    }
  }
  private validateGeneration(source: Source, generation: AssetGeneration, chunks: SourceChunk[]): string {
    generationSchema.parse(generation);
    if (generation.sourceId !== source.id || generation.chunkCount !== chunks.length) throw new Error('Generation ownership/count mismatch');
    const blocks = new Map<number, number>();
    for (const [i, input] of chunks.entries()) {
      const chunk = sourceChunkSchema.parse(input);
      if (chunk.courseId !== this.projectId || chunk.sourceId !== source.id || chunk.ordinal !== i
        || chunk.id !== generationChunkId(source.id, generation.id, i) || !chunk.text.isWellFormed() || chunk.text.includes('\0')) throw new Error('Invalid generation chunk');
      if (source.mimeType === 'application/pdf' && (chunk.locator.kind !== 'pdf' || !source.pageCount || chunk.locator.page > source.pageCount)) throw new Error('Invalid PDF provenance');
      if (chunk.locator.kind === 'pdf') {
        const next = blocks.get(chunk.locator.page) ?? 0;
        if (chunk.locator.block !== next) throw new Error('Invalid PDF block sequence');
        blocks.set(chunk.locator.page, next + 1);
      }
      if (source.mimeType !== 'application/pdf' && chunk.locator.kind !== 'text') throw new Error('Invalid text provenance');
    }
    if (source.mimeType !== 'application/pdf') validateTextLocators(chunks);
    const text = chunks.map(c => c.text).join(source.mimeType === 'application/pdf' ? '\n\n' : '');
    if (Buffer.byteLength(text) !== generation.textBytes) throw new Error('Generation byte count mismatch');
    if (source.mimeType !== 'application/pdf' && (hashText(text) !== source.contentHash || Buffer.byteLength(text) !== source.byteSize)) throw new Error('Text source checksum mismatch');
    return text;
  }
  begin(candidate: Source) {
    this.check(candidate.courseId); sourceSchema.parse(candidate);
    const result = this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM sources WHERE hash=?').get(candidate.contentHash);
      const previous = row ? sourceOf(row) : undefined;
      if (previous?.status === 'ready') return { source: previous, deduplicated: true };
      if (previous && this.imports.has(previous.id)) throw new LearningError('conflict', 'Source import already running');
      const usage = this.usage();
      if (!previous && usage.sourceCount >= Q.sources) throw new LearningError('limit-exceeded', 'Workspace accepts at most 200 sources');
      if (!previous && candidate.mimeType === 'application/pdf' && usage.archiveBinaryBytes + candidate.byteSize > Q.archiveBinaryBytes) throw new LearningError('limit-exceeded', 'Workspace PDF archive quota exceeded');
      if (previous) {
        const { errorCode: _error, ...rest } = previous;
        const source: Source = { ...rest, status: 'processing', updatedAt: candidate.updatedAt };
        this.writeSource(source); return { source, deduplicated: false };
      }
      this.db.prepare('INSERT INTO sources VALUES(?,?,?,NULL)').run(candidate.id, candidate.contentHash, JSON.stringify(candidate));
      return { source: candidate, deduplicated: false };
    });
    if (!result.deduplicated) this.imports.add(result.source.id); return result;
  }
  complete(source: Source, chunks: SourceChunk[]): void { this.activate(source, 'text-v1', chunks); }
  /** Files are immutable per generation; active pointer and both FTS projections change atomically. */
  activate(source: Source, generationId: string, chunks: SourceChunk[]): Source {
    this.check(source.courseId);
    const createdAt = this.reserveGeneration(source.id, generationId);
    const stem = source.filename.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]/gu, '-').slice(0, 60) || 'document';
    const canonicalAsset = `learning-assets/${stem}--${source.id.slice(4, 16)}--${generationId}.md`;
    const text = chunks.map(c => c.text).join(source.mimeType === 'application/pdf' ? '\n\n' : '');
    const generation: AssetGeneration = { id: generationId, sourceId: source.id, parser: source.parser,
      createdAt, canonicalAsset, textBytes: Buffer.byteLength(text), chunkCount: chunks.length };
    this.validateGeneration(source, generation, chunks);
    // Reserve and publish complete files before the atomic database switch. Failed attempts still count against storage limits.
    this.writeAsset(canonicalAsset, text, 'canonical');
    const provenance = { ...generation, originalAsset: source.originalAsset ?? null, chunks: chunks.map(c => ({ chunkId: c.id, locator: c.locator })) };
    this.writeDerived(source.id, generationId, 'provenance.json', JSON.stringify(provenance));
    const saved = this.transaction(() => {
      const current = this.getSource(source.id);
      if (current.contentHash !== source.contentHash || current.mimeType !== source.mimeType) throw new Error('Source identity changed');
      const existing = this.db.prepare('SELECT data FROM generations WHERE source_id=? AND id=?').get(source.id, generationId);
      if (existing) {
        const previous = this.db.prepare('SELECT data FROM chunks WHERE source_id=? AND generation_id=? ORDER BY ordinal').all(source.id, generationId).map(chunkOf);
        if (JSON.stringify(previous) !== JSON.stringify(chunks.map(c => sourceChunkSchema.parse(c)))) throw new LearningError('conflict', 'Generation identity has different content');
        if (current.activeGenerationId === generationId) return current;
      } else {
        const usage = this.usage();
        if (this.generations(source.id).length >= Q.generationsPerSource || usage.canonicalTextBytes > Q.canonicalTextBytes
          || usage.indexedTextBytes + generation.textBytes > Q.indexedTextBytes) throw new LearningError('limit-exceeded', 'Workspace generation/text quota exceeded');
        this.db.prepare('INSERT INTO generations VALUES(?,?,?)').run(source.id, generationId, JSON.stringify(generation));
        const insert = this.db.prepare('INSERT INTO chunks(id,source_id,generation_id,ordinal,text,data) VALUES(?,?,?,?,?,?)');
        for (const chunk of chunks) insert.run(chunk.id, source.id, generationId, chunk.ordinal, chunk.text, JSON.stringify(chunk));
      }
      if (this.ftsAvailable) {
        this.db.prepare('DELETE FROM chunks_fts WHERE rowid IN (SELECT rowid FROM chunks WHERE source_id=?)').run(source.id);
        this.db.prepare('DELETE FROM chunks_trigram WHERE rowid IN (SELECT rowid FROM chunks WHERE source_id=?)').run(source.id);
        this.db.prepare('INSERT INTO chunks_fts(rowid,text) SELECT rowid,text FROM chunks WHERE source_id=? AND generation_id=?').run(source.id, generationId);
        this.db.prepare('INSERT INTO chunks_trigram(rowid,text) SELECT rowid,text FROM chunks WHERE source_id=? AND generation_id=?').run(source.id, generationId);
      }
      const { errorCode: _error, ...metadata } = { ...current, parser: source.parser, updatedAt: source.updatedAt };
      const ready: Source = { ...metadata, status: 'ready', chunkCount: chunks.length, activeGenerationId: generationId, canonicalAsset };
      this.writeSource(ready); return ready;
    });
    this.imports.delete(source.id);
    // This pointer is an inspectable projection; database active generation remains authority.
    writeWorkspaceFile(this.root, `.learning-helper/provenance/${source.id}.json`, JSON.stringify({ sourceId: source.id, activeGenerationId: saved.activeGenerationId, canonicalAsset: saved.canonicalAsset, originalAsset: saved.originalAsset ?? null }));
    return saved;
  }
  fail(id: string, code: NonNullable<Source['errorCode']>, now: string): void {
    try { const source = this.getSource(id); if (source.status === 'processing') this.writeSource({ ...source, status: 'failed', errorCode: code, updatedAt: now }); }
    finally { this.imports.delete(id); }
  }
  assetization(id: string, state: NonNullable<Source['assetization']>): void {
    const source = this.getSource(id);
    if (source.assetization === state) return; // Recovery must not rewrite a settled state.
    this.writeSource({ ...source, assetization: state, updatedAt: new Date().toISOString() });
  }
  parsingMetadata(id: string, metadata: Pick<Source, 'pageCount' | 'originalAsset' | 'parseMode' | 'parseWarning' | 'parsing'>): Source {
    const source = this.getSource(id);
    if (source.mimeType !== 'application/pdf') throw new LearningError('invalid-input', 'PDF metadata requires a PDF source');
    const next = sourceSchema.parse({ ...source, ...metadata, updatedAt: new Date().toISOString() });
    if (next.originalAsset) workspacePath(this.root, next.originalAsset);
    this.writeSource(next); return next;
  }
  read(owner: string, ids: string[], signal: AbortSignal): EvidenceRead[] {
    this.check(owner); signal.throwIfAborted(); let chars = 0;
    return ids.map(id => {
      signal.throwIfAborted(); const row = this.db.prepare('SELECT * FROM chunks WHERE id=?').get(id);
      if (!row) throw new LearningError('not-found', 'Evidence chunk not found in this Workspace');
      const chunk = chunkOf(row); chars += chunk.text.length;
      if (chars > L.readChars) throw new LearningError('limit-exceeded', 'Read exceeds 24000 characters; request fewer chunks');
      return { ...citationFor(this.getSource(chunk.sourceId), chunk), text: chunk.text };
    });
  }
  search(owner: string, query: string, limit: number, signal: AbortSignal): EvidenceHit[] {
    this.check(owner); signal.throwIfAborted();
    const terms = query.toLowerCase().split(/\s+/u); let rows: Row[] = [];
    const latin = /^[a-z0-9\s]+$/i.test(query);
    const fts = latin ? 'chunks_fts' : 'chunks_trigram';
    if (this.ftsAvailable && (latin || terms.every(t => [...t].length >= 3))) {
      const match = terms.map(t => `"${t.replaceAll('"', '""')}"`).join(' AND ');
      rows = this.db.prepare(`SELECT c.*,bm25(${fts}) AS rank FROM ${fts} JOIN chunks c ON c.rowid=${fts}.rowid WHERE ${fts} MATCH ? ORDER BY rank,c.id LIMIT ?`).all(match, limit);
    } else {
      // Only <3-character / unavailable-FTS queries scan; total indexed bytes have an independent hard bound.
      for (const row of this.db.prepare('SELECT c.* FROM chunks c JOIN sources s ON c.source_id=s.id AND c.generation_id=s.active ORDER BY c.id').iterate()) {
        signal.throwIfAborted(); if (terms.every(t => String(row.text).toLowerCase().includes(t))) { rows.push({ ...row, rank: -1 }); if (rows.length >= limit) break; }
      }
    }
    return rows.map(row => {
      const chunk = chunkOf(row); const at = chunk.text.toLowerCase().indexOf(terms[0]!);
      return { ...citationFor(this.getSource(chunk.sourceId), chunk), score: -Number(row.rank), excerpt: textWindow(chunk.text, Math.max(0, at - 100), L.excerptChars) };
    });
  }
  close(): void { if (!this.closed) { this.closed = true; this.db.close(); } }
}
