import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { EVIDENCE_LIMITS as L, sourceSchema, sourceChunkSchema, textWindow } from '../domain/evidence.js';
import type { Source, SourceChunk, EvidenceHit, EvidenceRead, Citation } from '../domain/evidence.js';
import type { EvidenceStore } from '../services/evidence.js';
import { chunkIdentity, hashText } from '../services/evidence.js';
import { LearningError } from '../domain/errors.js';

type Row = Record<string, unknown>;
/** Runtime probe only catches missing FTS5; other SQLite failures remain errors. */
export function supportsFts5(): boolean {
  const db = new DatabaseSync(':memory:');
  try { db.exec('CREATE VIRTUAL TABLE probe USING fts5(text)'); return true; }
  catch (error) { if (error instanceof Error && /no such module: fts5/.test(error.message)) return false; throw error; }
  finally { db.close(); }
}
function sourceFrom(row: Row): Source {
  const source = sourceSchema.parse(JSON.parse(String(row.data)));
  if (source.id !== row.id || source.courseId !== row.course_id || source.contentHash !== row.content_hash
    || source.status !== row.status || source.byteSize !== row.byte_size) throw new Error('Evidence source metadata mismatch');
  return source;
}
function chunkFrom(row: Row): SourceChunk {
  return sourceChunkSchema.parse({ id: row.id, sourceId: row.source_id, courseId: row.course_id, ordinal: row.ordinal,
    text: row.text, locator: JSON.parse(String(row.locator)) });
}
export function citationFor(source: Source, chunk: SourceChunk): Citation {
  const loc = chunk.locator;
  const place = loc.kind === 'pdf' ? `p.${loc.page}` : `${loc.section ? `${loc.section} · ` : ''}L${loc.startLine}–${loc.endLine}`;
  return { chunkId: chunk.id, sourceId: source.id, filename: source.filename, locator: loc,
    canonicalRef: `learning-evidence://${source.courseId}/${source.id}/${chunk.id}`,
    citationLabel: `${source.filename} · ${place}`.replace(/[\[\]\\<>`]/g, c => ({ '[': '［', ']': '］', '\\': '＼', '<': '＜', '>': '＞', '`': '｀' })[c]!) };
}
/** Own database, public node:sqlite only. Never opens state.db or Harness storage internals. */
export class SqliteEvidenceStore implements EvidenceStore {
  private readonly db: DatabaseSync;
  readonly ftsAvailable: boolean;
  private closed = false;
  private readonly activeImports = new Set<string>();
  constructor(path: string, options: { fts?: boolean } = {}) {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path, { enableForeignKeyConstraints: true, allowExtension: false });
    try {
      this.db.exec('PRAGMA busy_timeout=250;');
      const version = Number(this.db.prepare('PRAGMA user_version').get()!['user_version']);
      if (version !== 0 && version !== 1) throw new Error(`Unsupported Evidence schema version ${version}`);
      if (version === 0) {
        if (this.db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all().length) throw new Error('Unversioned nonempty Evidence database');
        this.db.exec(`BEGIN IMMEDIATE;
          CREATE TABLE sources(id TEXT PRIMARY KEY, course_id TEXT NOT NULL, content_hash TEXT NOT NULL,
            status TEXT NOT NULL CHECK(status IN ('processing','ready','failed')), byte_size INTEGER NOT NULL, data TEXT NOT NULL,
            UNIQUE(course_id, content_hash), UNIQUE(id, course_id));
          CREATE TABLE chunks(rowid INTEGER PRIMARY KEY, id TEXT NOT NULL UNIQUE, course_id TEXT NOT NULL, source_id TEXT NOT NULL,
            ordinal INTEGER NOT NULL, text TEXT NOT NULL, locator TEXT NOT NULL, UNIQUE(source_id, ordinal),
            FOREIGN KEY(source_id, course_id) REFERENCES sources(id, course_id));
          CREATE INDEX chunks_course ON chunks(course_id);
          PRAGMA user_version=1; COMMIT;`);
      }
      if (Object.values(this.db.prepare('PRAGMA quick_check').get()!)[0] !== 'ok' || this.db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Evidence database integrity failed');
      this.ftsAvailable = (options.fts ?? true) && supportsFts5();
      // Validate truth before any recovery/index maintenance can modify this database.
      this.validateStoredSources();
      this.transaction(() => {
        for (const row of this.db.prepare("SELECT * FROM sources WHERE status='processing'").all()) {
          const source = sourceFrom(row);
          this.writeSource({ ...source, status: 'failed', errorCode: 'interrupted', updatedAt: new Date().toISOString() });
        }
        if (this.ftsAvailable) {
          this.db.exec("CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(text, course_key, tokenize='unicode61'); DELETE FROM chunks_fts;");
          // Bounded rebuild from validated chunks. FTS is a projection, never source truth.
          const insert = this.db.prepare('INSERT INTO chunks_fts(rowid,text,course_key) VALUES(?,?,?)');
          for (const row of this.db.prepare('SELECT rowid,text,course_id FROM chunks').iterate()) insert.run(Number(row.rowid), String(row.text), hashText(String(row.course_id)));
        }
      });
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=4194304;');
    } catch (error) { this.db.close(); throw error; }
  }
  private ensureOpen(): void { if (this.closed) throw new LearningError('closed', 'Evidence database is closed'); }
  private transaction<T>(operation: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private validateStoredSources(): void {
    const totals = new Map<string, { count: number; bytes: number }>();
    for (const row of this.db.prepare('SELECT * FROM sources').iterate()) {
      const source = sourceFrom(row);
      if (source.id !== `src_${hashText(`${source.courseId}:${source.contentHash}`)}`) throw new Error('Evidence source identity mismatch');
      const chunks = this.db.prepare('SELECT * FROM chunks WHERE source_id=? ORDER BY ordinal').all(source.id).map(chunkFrom);
      this.validateChunks(source, chunks);
      const total = totals.get(source.courseId) ?? { count: 0, bytes: 0 };
      total.count++; total.bytes += source.status === 'failed' ? 0 : source.byteSize; totals.set(source.courseId, total);
      if (total.count > L.sources || total.bytes > L.courseBytes || totals.size > 32) throw new Error('Evidence corpus capacity exceeded');
    }
  }
  private validateChunks(source: Source, chunks: SourceChunk[]): void {
    if (source.status !== 'ready') {
      if (chunks.length || source.chunkCount) throw new Error('Partial Evidence import exposed chunks');
      return;
    }
    if (!chunks.length || chunks.length !== source.chunkCount || chunks.length > L.chunks) throw new Error('Evidence chunk count mismatch');
    let line = 1; let column = 1;
    for (const [ordinal, chunk] of chunks.entries()) {
      if (chunk.sourceId !== source.id || chunk.courseId !== source.courseId || chunk.ordinal !== ordinal || chunk.id !== chunkIdentity(source.id, ordinal)
        || !chunk.text.isWellFormed()) throw new Error('Evidence chunk identity/Unicode mismatch');
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
    const text = chunks.map(c => c.text).join('');
    if (!text.isWellFormed() || text.includes('\0') || hashText(text) !== source.contentHash || Buffer.byteLength(text) !== source.byteSize) throw new Error('Evidence content hash mismatch');
  }
  private writeSource(source: Source): void {
    this.db.prepare('UPDATE sources SET status=?, data=? WHERE id=?').run(source.status, JSON.stringify(source), source.id);
  }
  begin(candidate: Source) {
    this.ensureOpen(); sourceSchema.parse(candidate);
    const result = this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM sources WHERE course_id=? AND content_hash=?').get(candidate.courseId, candidate.contentHash);
      const existing = row ? sourceFrom(row) : undefined;
      if (existing?.status === 'ready') return { source: existing, deduplicated: true };
      if (existing?.status === 'processing' && this.activeImports.has(existing.id)) throw new LearningError('conflict', 'Source import is already processing; retry later');
      const count = Number(this.db.prepare('SELECT count(*) AS n FROM sources WHERE course_id=?').get(candidate.courseId)!.n);
      const bytes = Number(this.db.prepare("SELECT coalesce(sum(byte_size),0) AS n FROM sources WHERE course_id=? AND status!='failed' AND id!=?").get(candidate.courseId, candidate.id)!.n);
      if ((!existing && count >= L.sources) || bytes + candidate.byteSize > L.courseBytes) throw new LearningError('limit-exceeded', 'Course source capacity reached');
      if (existing) {
        const { errorCode: _error, ...previous } = existing;
        const source: Source = { ...previous, status: 'processing', updatedAt: candidate.updatedAt };
        this.writeSource(source); return { source, deduplicated: false };
      }
      this.db.prepare('INSERT INTO sources VALUES(?,?,?,?,?,?)').run(candidate.id, candidate.courseId, candidate.contentHash,
        candidate.status, candidate.byteSize, JSON.stringify(candidate));
      return { source: candidate, deduplicated: false };
    });
    if (!result.deduplicated) this.activeImports.add(result.source.id);
    return result;
  }
  complete(source: Source, chunks: SourceChunk[]): void {
    this.ensureOpen(); sourceSchema.parse(source); chunks.forEach(c => sourceChunkSchema.parse(c)); this.validateChunks(source, chunks);
    this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM sources WHERE id=?').get(source.id);
      if (!row || sourceFrom(row).status !== 'processing') throw new LearningError('conflict', 'Source is not processing');
      const insert = this.db.prepare('INSERT INTO chunks(id,course_id,source_id,ordinal,text,locator) VALUES(?,?,?,?,?,?)');
      const fts = this.ftsAvailable ? this.db.prepare('INSERT INTO chunks_fts(rowid,text,course_key) VALUES(?,?,?)') : undefined;
      for (const chunk of chunks) {
        const result = insert.run(chunk.id, chunk.courseId, chunk.sourceId, chunk.ordinal, chunk.text, JSON.stringify(chunk.locator));
        fts?.run(result.lastInsertRowid, chunk.text, hashText(chunk.courseId));
      }
      this.writeSource(source);
    });
    this.activeImports.delete(source.id);
  }
  fail(id: string, code: NonNullable<Source['errorCode']>, now: string): void {
    this.ensureOpen();
    try {
      const row = this.db.prepare('SELECT * FROM sources WHERE id=?').get(id);
      if (row && row.status === 'processing') this.writeSource({ ...sourceFrom(row), status: 'failed', errorCode: code, updatedAt: now });
    } finally {
      // A lock can also block the failure marker. Explicit reimport may reclaim a
      // processing row once this Host no longer has an operation owning it.
      this.activeImports.delete(id);
    }
  }
  listSources(courseId: string): Source[] {
    this.ensureOpen(); return this.db.prepare('SELECT * FROM sources WHERE course_id=? ORDER BY id').all(courseId).map(sourceFrom);
  }
  private project(row: Row): EvidenceRead {
    const chunk = chunkFrom(row); const source = sourceFrom(this.db.prepare('SELECT * FROM sources WHERE id=?').get(chunk.sourceId)!);
    return { ...citationFor(source, chunk), text: chunk.text };
  }
  search(courseId: string, query: string, limit: number, signal: AbortSignal): EvidenceHit[] {
    this.ensureOpen(); signal.throwIfAborted(); let rows: Row[];
    const tokens = query.toLowerCase().split(/\s+/u);
    if (this.ftsAvailable && /^[a-z0-9\s]+$/i.test(query)) {
      const match = `course_key : "${hashText(courseId)}" AND text : (${tokens.map(t => `"${t.replaceAll('"', '""')}"`).join(' AND ')})`;
      rows = this.db.prepare(`SELECT c.*, bm25(chunks_fts) AS rank FROM chunks_fts JOIN chunks c ON c.rowid=chunks_fts.rowid
        JOIN sources s ON s.id=c.source_id WHERE chunks_fts MATCH ? AND c.course_id=? AND s.status='ready' ORDER BY rank, c.id LIMIT ?`).all(match, courseId, limit);
    } else {
      rows = [];
      for (const row of this.db.prepare("SELECT c.* FROM chunks c JOIN sources s ON s.id=c.source_id WHERE c.course_id=? AND s.status='ready' ORDER BY c.id").iterate(courseId)) {
        signal.throwIfAborted(); const text = String(row.text).toLowerCase();
        if (tokens.every(t => text.includes(t))) { rows.push({ ...row, rank: -1 }); if (rows.length >= limit) break; }
      }
    }
    signal.throwIfAborted();
    return rows.map(row => {
      const { text, ...citation } = this.project(row); const at = text.toLowerCase().indexOf(tokens[0]!);
      const start = Math.max(0, at - 100);
      return { ...citation, score: -Number(row.rank), excerpt: textWindow(text, start, L.excerptChars) };
    });
  }
  read(courseId: string, ids: string[], signal: AbortSignal): EvidenceRead[] {
    this.ensureOpen(); signal.throwIfAborted(); let total = 0;
    return ids.map(id => {
      signal.throwIfAborted();
      const row = this.db.prepare("SELECT c.* FROM chunks c JOIN sources s ON s.id=c.source_id WHERE c.id=? AND c.course_id=? AND s.status='ready'").get(id, courseId);
      if (!row) throw new LearningError('not-found', 'Evidence chunk not found in this course');
      const value = this.project(row); total += value.text.length;
      if (total > L.readChars) throw new LearningError('limit-exceeded', 'Evidence read exceeds 24000 characters; request fewer chunks');
      return value;
    });
  }
  close(): void { if (!this.closed) { this.closed = true; this.db.close(); } }
}
