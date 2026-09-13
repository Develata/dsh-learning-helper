import { requiredString as str, integer as int } from './shared.js';
const strings = { type: 'array', items: { type: 'string' }, required: true } as const;
export const taskProperties = { type: { type: 'string', enum: ['learn', 'review', 'practice'], required: true },
  conceptIds: strings, estimatedMinutes: int, reason: str, questionCount: { type: 'integer', description: 'Only for practice: integer 1–20. For learn/review OMIT this field entirely; do not send 0 or null.' } } as const;
const { questionCount: practiceCount, ...studyTaskProperties } = taskProperties;
export const taskDraft = { oneOf: [
  { type: 'object', additionalProperties: false, properties: { ...studyTaskProperties, type: { type: 'string', enum: ['learn', 'review'], required: true } } },
  { type: 'object', additionalProperties: false, properties: { ...studyTaskProperties, type: { type: 'string', const: 'practice', required: true }, questionCount: practiceCount } },
] } as const;
