import { Context } from '@deepseek-ai/cordis';
import Storage from '@deepseek-ai/dsh-storage';
import { DomainFacility } from '@deepseek-ai/dsh-storage-domain';
import { SqliteStorageBackend, Config } from '@deepseek-ai/dsh-storage-sqlite';
import { HarnessLearningStore } from '../src/providers/storage-domain.js';
import { LearningService } from '../src/services/learning.js';

export async function openLearning(path = ':memory:', now = '2026-09-12T10:00:00.000Z') {
  const ctx = new Context();
  await ctx.plugin(Storage);
  const backend = new SqliteStorageBackend(new Config({ path }));
  const unregister = ctx.storage.backend.register('sqlite', backend);
  const facility = new DomainFacility(ctx, { backend: 'sqlite' });
  try {
    const store = await HarnessLearningStore.open(facility);
    const service = new LearningService(store, () => new Date(now));
    return { store, service, ctx, async close() { await store.close(); unregister(); await backend.close(); await ctx.fiber.dispose(); } };
  } catch (error) { unregister(); await backend.close(); await ctx.fiber.dispose(); throw error; }
}
