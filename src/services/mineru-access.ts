import { createHash } from 'node:crypto';
import { credentialKey } from '@deepseek-ai/dsh-credentials';
import type { CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';
import { LearningError } from '../domain/errors.js';
import { validate } from './evidence.js';
import { cancelled } from './cancellation.js';
import { MinerUAssetizer } from '../providers/mineru.js';
import { MinerUCloudAssetizer } from '../providers/mineru-cloud.js';
import type { MinerUConfig } from '../workspace/config.js';

type Credentials = Pick<CredentialProvider, 'readRecord' | 'describeRecord' | 'modifyRecord' | 'deleteRecord'>;
const tokenSchema = z.strictObject({ token: z.string().trim().regex(/^[!-~]{1,8192}$/) });
/** Project identity scopes the host-managed secret; portable Workspace files never contain credentials. */
export class MinerUAccess {
  constructor(private readonly credentials: Credentials) {}
  private key(projectId: string) { return credentialKey('learning-helper', `mineru-cloud-${createHash('sha256').update(projectId).digest('hex')}`); }
  private async bounded<T>(action: () => Promise<T>, signal: AbortSignal): Promise<T> {
    const bounded = AbortSignal.any([signal, AbortSignal.timeout(5000)]); bounded.throwIfAborted();
    try { return await cancelled(action(), bounded); }
    catch { throw new LearningError('unavailable', 'MinerU credential storage unavailable; retry'); }
  }
  status(projectId: string, signal: AbortSignal) {
    return this.bounded(async () => {
      const info = await this.credentials.describeRecord(this.key(projectId));
      return { configured: info.configured, writable: info.writable };
    }, signal);
  }
  async save(projectId: string, input: unknown, signal: AbortSignal) {
    const { token } = validate(tokenSchema, input);
    await this.bounded(() => this.credentials.modifyRecord(this.key(projectId), async () => ({ kind: 'api-key', key: token })), signal);
    return this.status(projectId, signal);
  }
  async remove(projectId: string, signal: AbortSignal) {
    await this.bounded(() => this.credentials.deleteRecord(this.key(projectId)), signal);
    return this.status(projectId, signal);
  }
  async adapter(projectId: string, config: MinerUConfig, signal: AbortSignal) {
    if (config.provider !== 'cloud') return new MinerUAssetizer(config, process.env.LEARNING_HELPER_MINERU_TOKEN);
    const record = await this.bounded(() => this.credentials.readRecord(this.key(projectId)), signal);
    if (record?.kind !== 'api-key' || !record.key) throw new LearningError('unavailable', 'Save the MinerU cloud API key in this Workspace first');
    return new MinerUCloudAssetizer(record.key, config.cloudModel ?? 'vlm');
  }
}
