// Pure acceptance projection. Never persist request headers, credentials or raw tool arguments.
export const learningTools = ['course_list', 'course_search', 'course_read', 'learning_state_get',
  'course_outline_publish', 'study_plan_publish', 'quiz_publish'];
// Standard Harness task bookkeeping and trusted skill loading are legitimate auxiliary actions.
export const auxiliaryTools = ['todo_write', 'skill'];

export function projectTrajectory(events) {
  const failedPublications = []; const planDrafts = new Map(); const calls = new Map(); const drafts = new Map(); const authoredQuizzes = []; const tools = []; const reads = []; const publications = []; const successfulPublications = []; let answer = ''; let reason; let errorCode;
  for (const event of events) {
    if (event.type === 'tool/call') {
      calls.set(event.data.callId, event.data.name); tools.push(event.data.name);
      if (event.data.name.endsWith('_publish')) {
        let evidenceChunkIds = [];
        try {
          const draft = JSON.parse(event.data.arguments);
          evidenceChunkIds = (draft.concepts ?? draft.items ?? []).flatMap(item => item.evidenceChunkIds ?? []);
        } catch { /* Invalid input cannot establish grounded authorship. */ }
        publications.push({ name: event.data.name, callId: event.data.callId, seq: event.seq, evidenceChunkIds, succeeded: false });
      }
      if (event.data.name === 'study_plan_publish') {
        try { const p = JSON.parse(event.data.arguments); planDrafts.set(event.data.callId, { courseId: p.courseId, startsOn: p.startsOn, days: p.days }); } catch { /* Invalid JSON has no usable draft. */ }
      }
      if (event.data.name === 'quiz_publish') {
        try { drafts.set(event.data.callId, JSON.parse(event.data.arguments)); } catch { /* Malformed calls cannot establish a published quiz. */ }
      }
    }
    const toolResult = event.type === 'tool/result' ? event.data.message.content.find(b => b.type === 'tool-result') : undefined;
    if (toolResult?.isError && calls.get(toolResult.toolCallId)?.endsWith('_publish')) {
      failedPublications.push({ name: calls.get(toolResult.toolCallId), planDraft: planDrafts.get(toolResult.toolCallId), error: toolResult.content.filter(b => b.type === 'text').map(b => b.text).join(' ').slice(0, 2000) });
    }
    if (toolResult && !toolResult.isError && calls.get(toolResult.toolCallId)?.endsWith('_publish')) {
      successfulPublications.push(calls.get(toolResult.toolCallId));
      const publication = publications.find(p => p.callId === toolResult.toolCallId);
      if (publication) publication.succeeded = true;
    }
    if (toolResult && !toolResult.isError && drafts.has(toolResult.toolCallId)) {
      const draft = drafts.get(toolResult.toolCallId);
      authoredQuizzes.push({ purpose: draft.purpose, items: (draft.items ?? []).map(q => ({ prompt: q.prompt, options: q.options,
        correctOption: q.correctOption, explanation: q.explanation, conceptIds: q.conceptIds, evidenceChunkIds: q.evidenceChunkIds })) });
    }
    if (toolResult && calls.get(toolResult.toolCallId) === 'course_read' && !toolResult.isError) {
      for (const block of toolResult.content) {
        if (block.type !== 'text') continue;
        const start = block.text.indexOf('{'); if (start < 0) continue;
        try { const value = JSON.parse(block.text.slice(start));
          for (const c of value.chunks ?? []) reads.push({ chunkId: c.chunkId, canonicalRef: c.canonicalRef, citationLabel: c.citationLabel, seq: event.seq });
        } catch { /* Non-canonical blocks do not establish citation authority. */ }
      }
    }
    if (event.type === 'assistant/message') {
      const text = event.data.message.content.filter(b => b.type === 'text').map(b => b.text).join('');
      if (text) answer = { text, seq: event.seq };
    }
    if (event.type === 'turn/end') { reason = event.data.reason?.kind; errorCode = event.data.reason?.error?.code; }
  }
  const text = answer.text ?? '';
  const cited = [...text.matchAll(/\[([^\]]+)\]\((learning-evidence:\/\/[^\s)]+)\)/g)].map(m => ({ citationLabel: m[1], canonicalRef: m[2] }));
  const rawRefs = [...text.matchAll(/learning-evidence:\/\/[^\s)\]>]+/g)].map(m => m[0]);
  const valid = cited.every(c => reads.some(r => r.seq < answer.seq && r.canonicalRef === c.canonicalRef && r.citationLabel === c.citationLabel));
  return { tools, reads, successfulPublications, failedPublications, authoredQuizzes, answer: text, reason, errorCode, citations: cited,
    checks: { completed: reason === 'completed', searchUsed: tools.includes('course_search'), readUsed: reads.length > 0,
      citationsValid: valid && rawRefs.length === cited.length,
      groundedCitation: cited.length > 0 && valid && rawRefs.length === cited.length,
      readBeforePublish: publications.every(p => reads.some(r => r.seq < p.seq)),
      authoredEvidenceRead: publications.filter(p => p.succeeded && p.name !== 'study_plan_publish').every(p => p.evidenceChunkIds.length > 0
        && p.evidenceChunkIds.every(id => reads.some(r => r.chunkId === id && r.seq < p.seq))),
      onlyExpectedTools: tools.every(n => [...learningTools, ...auxiliaryTools].includes(n)) } };
}
