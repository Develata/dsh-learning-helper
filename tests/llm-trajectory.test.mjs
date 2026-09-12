import test from 'node:test';
import assert from 'node:assert/strict';
import { projectTrajectory } from '../scripts/llm-trajectory.mjs';
import { createToolResultMessage } from '@deepseek-ai/dsh-llm';
const ref = 'learning-evidence://course/source/chunk';
function trajectory({ label = 'Lecture · L1–3', reference = ref, readSeq = 2, publishSeq = 3 } = {}) {
  return [
    { type: 'tool/call', seq: 0, data: { callId: 'search', name: 'course_search', arguments: '{}' } },
    { type: 'tool/call', seq: 1, data: { callId: 'read', name: 'course_read', arguments: '{}' } },
    { type: 'tool/result', seq: readSeq, data: { message: createToolResultMessage({ callId: 'read', isError: false,
      content: [{ type: 'text', text: 'UNTRUSTED\n' + JSON.stringify({ chunks: [{ chunkId: 'chunk', canonicalRef: ref, citationLabel: 'Lecture · L1–3' }] }) }] }) } },
    { type: 'tool/call', seq: publishSeq, data: { callId: 'plan', name: 'study_plan_publish', arguments: '{}' } },
    { type: 'assistant/message', seq: 4, data: { message: { content: [{ type: 'text', text: `[${label}](${reference})` }] } } },
    { type: 'turn/end', seq: 5, data: { reason: { kind: 'completed' } } },
  ];
}
test('actual prior read establishes exact label/ref authority; invented or late refs do not', () => {
  assert.equal(projectTrajectory(trajectory()).checks.groundedCitation, true);
  for (const options of [{ label: 'Lecture · p.7' }, { reference: ref + '-fake' }, { readSeq: 6 }])
    assert.equal(projectTrajectory(trajectory(options)).checks.groundedCitation, false);
  assert.equal(projectTrajectory(trajectory({ publishSeq: 1 })).checks.readBeforePublish, false);
});
test('failed turns and arbitrary tools cannot pass; request secrets and raw arguments are excluded', () => {
  const events = trajectory();
  events.push({ type: 'request/header', data: { token: 'test-secret' } });
  events.push({ type: 'tool/call', data: { callId: 'bad', name: 'bash', arguments: '{"secret":"test-secret"}' } });
  events.push({ type: 'turn/end', data: { reason: { kind: 'error', error: { code: 'MISSING_CREDENTIAL', message: 'test-secret' } } } });
  const result = projectTrajectory(events);
  assert.equal(result.checks.completed, false); assert.equal(result.checks.onlyExpectedTools, false);
  assert.equal(result.errorCode, 'MISSING_CREDENTIAL'); assert.ok(!JSON.stringify(result).includes('test-secret'));
});

test('a publish call alone or rejected result is not a durable publication receipt', () => {
  const events = trajectory();
  assert.deepEqual(projectTrajectory(events).successfulPublications, []);
  const result = failed => ({ type: 'tool/result', seq: 4, data: { message: createToolResultMessage({ callId: 'plan', isError: failed, content: [{ type: 'text', text: '{}' }] }) } });
  assert.deepEqual(projectTrajectory([...events, result(true)]).successfulPublications, []);
  assert.deepEqual(projectTrajectory([...events, result(false)]).successfulPublications, ['study_plan_publish']);
});
