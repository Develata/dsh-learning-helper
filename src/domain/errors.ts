export type LearningErrorCode = 'not-found' | 'conflict' | 'invalid-input' | 'limit-exceeded' | 'unavailable' | 'closed';
/** Stable application failures; infrastructure details stay in Host logs. */
export class LearningError extends Error {
  constructor(readonly code: LearningErrorCode, message: string) { super(message); this.name = 'LearningError'; }
}
