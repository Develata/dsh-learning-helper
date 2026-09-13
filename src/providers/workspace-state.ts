import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { LearningStore } from '../services/learning.js';
import type { Course, LearningAggregate } from '../domain/model.js';
import { courseSchema } from '../domain/model.js';
import { learningStateSchema } from '../services/state-schema.js';
import { LearningError } from '../domain/errors.js';

/** One workspace, one aggregate. The existing application owns all learning semantics. */
export class WorkspaceLearningStore implements LearningStore {
  private readonly db: DatabaseSync;
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private closing = false;
  private disposal: Promise<void> | undefined;
  constructor(path: string, readonly projectId: string) {
    const existed = path !== ":memory:" && existsSync(path);
    this.db = new DatabaseSync(path, { allowExtension: false });
    try {
      this.db.exec('PRAGMA busy_timeout=250');
      const version = Number(this.db.prepare('PRAGMA user_version').get()!['user_version']);
      if (version !== 0 && version !== 2) throw new Error(`Unsupported workspace state schema ${version}; explicit migration required`);
      if (version === 0) {
        if (existed) throw new LearningError('unavailable', 'Existing learning database has no schema; explicit recovery required');
        if (this.db.prepare("SELECT name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'").all().length) throw new Error('Unversioned nonempty learning database');
        this.db.exec(`BEGIN IMMEDIATE; CREATE TABLE learning(singleton INTEGER PRIMARY KEY CHECK(singleton=1), project_id TEXT NOT NULL, data TEXT NOT NULL); PRAGMA user_version=2; COMMIT;`);
      }
      if (Object.values(this.db.prepare('PRAGMA quick_check').get()!)[0] !== 'ok') throw new Error('Learning database integrity failed');
      this.snapshot(); // Validate before any application can access this workspace.
      this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA wal_autocheckpoint=256; PRAGMA journal_size_limit=4194304;');
    } catch (error) { this.db.close(); throw error; }
  }
  private open(): void { if (this.closing) throw new LearningError('closed', 'Workspace learning store is closing'); }
  private snapshot(): LearningAggregate | undefined {
    const row = this.db.prepare('SELECT * FROM learning WHERE singleton=1').get();
    if (!row) return undefined;
    const state = learningStateSchema.parse(JSON.parse(String(row.data)));
    if (row.project_id !== this.projectId || state.course.id !== this.projectId) throw new Error('Workspace manifest/state identity mismatch');
    return state;
  }
  get(id: string): LearningAggregate | undefined { this.open(); return id === this.projectId ? this.snapshot() : undefined; }
  getCourse(id: string): Course | undefined {
    this.open();
    if (id !== this.projectId) return undefined;
    const row = this.db.prepare("SELECT json_extract(data,'$.course') AS course FROM learning WHERE singleton=1 AND project_id=?").get(id);
    return row ? courseSchema.parse(JSON.parse(String(row.course))) : undefined;
  }
  listCourses(): Course[] { const course = this.getCourse(this.projectId); return course ? [course] : []; }
  private enqueue<T>(operation: () => T): Promise<T> {
    if (this.closing) return Promise.reject(new LearningError('closed', 'Workspace learning store is closing'));
    if (this.pending >= 32) return Promise.reject(new LearningError('unavailable', 'Workspace write queue full; retry the same operation'));
    this.pending++;
    const result = this.tail.then(() => {
      this.db.exec('BEGIN IMMEDIATE');
      try { const value = operation(); this.db.exec('COMMIT'); return value; }
      catch (error) { this.db.exec('ROLLBACK'); throw error; }
    });
    this.tail = result.then(() => { this.pending--; }, () => { this.pending--; });
    return result;
  }
  create(input: LearningAggregate): Promise<void> {
    const state = learningStateSchema.parse(input);
    return this.enqueue(() => {
      if (state.course.id !== this.projectId) throw new LearningError('invalid-input', 'Workspace identity is immutable');
      if (this.snapshot()) throw new LearningError('conflict', 'Workspace already initialized');
      this.db.prepare('INSERT INTO learning VALUES(1,?,?)').run(this.projectId, JSON.stringify(state));
    });
  }
  update(id: string, transform: (current: LearningAggregate) => LearningAggregate): Promise<LearningAggregate> {
    return this.enqueue(() => {
      if (id !== this.projectId) throw new LearningError('not-found', 'Learning project not found');
      const current = this.snapshot();
      if (!current) throw new LearningError('not-found', 'Workspace is not initialized');
      const before = JSON.stringify(current);
      const next = learningStateSchema.parse(transform(current));
      if (next.course.id !== this.projectId) throw new LearningError('invalid-input', 'Workspace identity is immutable');
      const serialized = JSON.stringify(next);
      if (before !== serialized) this.db.prepare('UPDATE learning SET data=? WHERE singleton=1').run(serialized);
      return next;
    });
  }
  close(): Promise<void> {
    this.closing = true;
    return this.disposal ??= this.tail.then(() => { this.db.close(); });
  }
}
