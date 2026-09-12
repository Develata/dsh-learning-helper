import { defineDomain, domainTable } from '@deepseek-ai/dsh-storage-domain';
import type { Domain, DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import { aggregateSchema } from '../domain/model.js';
import type { LearningAggregate } from '../domain/model.js';
import { LearningError } from '../domain/errors.js';
import type { LearningStore } from '../services/learning.js';

export const learningDomain = defineDomain({ name: 'learning_helper', version: 1,
  tables: { courses: domainTable<string, LearningAggregate>(aggregateSchema) } });

/** Single-writer adapter. A bounded queue also makes create-if-absent atomic within this Host. */
export class HarnessLearningStore implements LearningStore {
  private tail: Promise<unknown> = Promise.resolve();
  private pending = 0;
  private closing = false;
  private disposal: Promise<void> | undefined;
  private constructor(private readonly domain: Domain<typeof learningDomain>) {}
  static async open(facility: DomainFacility): Promise<HarnessLearningStore> {
    const domain = await facility.open(learningDomain);
    for (const [key, state] of domain.table('courses').entries()) {
      if (key !== state.course.id) { await domain.close(); throw new LearningError('invalid-input', 'Stored course key does not match identity'); }
    }
    return new HarnessLearningStore(domain);
  }
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new LearningError('closed', 'Learning store is closing'));
    if (this.pending >= 32) return Promise.reject(new LearningError('unavailable', 'Learning store queue is full; retry the same submission'));
    this.pending++;
    const result = this.tail.then(job);
    this.tail = result.then(() => { this.pending--; }, () => { this.pending--; });
    return result;
  }
  get(id: string): LearningAggregate | undefined {
    if (this.closing) throw new LearningError('closed', 'Learning store is closing');
    const state = this.domain.table('courses').get(id);
    return state === undefined ? undefined : structuredClone(state);
  }
  create(state: LearningAggregate): Promise<void> {
    const owned = aggregateSchema.parse(state);
    return this.enqueue(async () => {
      const table = this.domain.table('courses');
      if (table.get(owned.course.id)) throw new LearningError('conflict', 'Course already exists');
      if (table.size >= 32) throw new LearningError('limit-exceeded', 'Course capacity reached');
      await table.put(owned.course.id, owned);
    });
  }
  update(id: string, transform: (current: LearningAggregate) => LearningAggregate): Promise<LearningAggregate> {
    return this.enqueue(async () => {
      const table = this.domain.table('courses');
      const current = table.get(id);
      if (!current) throw new LearningError('not-found', 'Course not found');
      const next = transform(structuredClone(current));
      if (next.course.id !== id) throw new LearningError('invalid-input', 'Course identity is immutable');
      const validated = aggregateSchema.parse(next);
      // Replay acknowledgement must not emit a new domain write or fail on an unrelated lock.
      if (JSON.stringify(current) === JSON.stringify(validated)) return structuredClone(current);
      const saved = await table.update(id, () => validated);
      return structuredClone(saved);
    });
  }
  close(): Promise<void> {
    this.closing = true;
    this.disposal ??= this.tail.then(() => this.domain.close());
    return this.disposal;
  }
}
