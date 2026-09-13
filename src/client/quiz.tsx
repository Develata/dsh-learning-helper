import { useEffect, useId, useRef, useState } from 'react';
import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { PublicQuiz, QuizResult, StudentDashboard, Submission } from './types.js';
import { request, sessionPath, errorText } from './api.js';
import { conceptNames, savedSubmission, saveSubmission, clearSubmission } from './model.js';
import { Failure, Loading } from './common.js';
import { useResource } from './resource.js';
import { LearningContent } from './learning-content.js';
export function QuizView({ sessionId, projectId, quizId, concepts, onSubmitted, back }: { sessionId: string; projectId: string; quizId: string;
  concepts: StudentDashboard['concepts']; onSubmitted: () => void; back: () => void }) {
  const [retry, setRetry] = useState(0);
  const path = `${sessionPath(sessionId)}/quizzes/${encodeURIComponent(quizId)}`;
  const state = useResource(`${projectId}:${quizId}:${retry}`, async signal => {
    const [quiz, feedback] = await Promise.all([request<PublicQuiz>(path, signal), request<{ result: QuizResult | null }>(path + '/result', signal)]);
    return { quiz, result: feedback.result };
  });
  return <section aria-label="练习作答"><Button onClick={back}>返回练习列表</Button>
    {state.status === 'loading' ? <Loading text="正在读取练习…"/> : state.status === 'error' ? <Failure message={state.error} retry={() => setRetry(n => n + 1)}/> :
      <QuizForm key={`${projectId}:${quizId}`} sessionId={sessionId} projectId={projectId} quiz={state.data.quiz} initialResult={state.data.result} concepts={concepts} onSubmitted={onSubmitted}/>}
  </section>;
}
export function QuizForm({ sessionId, projectId, quiz, initialResult, concepts, onSubmitted }: { sessionId: string; projectId: string; quiz: PublicQuiz; initialResult: QuizResult | null;
  concepts: StudentDashboard['concepts']; onSubmitted: () => void }) {
  const questionPrefix = useId();
  const [result, setResult] = useState(initialResult);
  const [pending, setPending] = useState<Submission | null>(() => initialResult ? null : savedSubmission(projectId, quiz));
  const [answers, setAnswers] = useState<Record<string, number>>(() => Object.fromEntries(pending?.answers.map(a => [a.itemId, a.selectedOption]) ?? []));
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const flight = useRef<AbortController | null>(null);
  const frozen = useRef(pending);
  useEffect(() => () => flight.current?.abort(), []);
  async function submit() {
    if (flight.current || result) return;
    if (!frozen.current && quiz.items.some(i => answers[i.id] === undefined)) return;
    const payload = frozen.current ?? { submissionId: `submission-${crypto.randomUUID()}`, quizId: quiz.id,
      answers: quiz.items.map(i => ({ itemId: i.id, selectedOption: answers[i.id]! })) };
    frozen.current = payload; setPending(payload); saveSubmission(projectId, payload);
    const controller = new AbortController(); flight.current = controller; setBusy(true); setError('');
    try {
      await request<unknown>(`${sessionPath(sessionId)}/submissions`, controller.signal, payload);
      const response = await request<{ result: QuizResult | null }>(`${sessionPath(sessionId)}/quizzes/${quiz.id}/result`, controller.signal);
      if (!response.result) throw new Error('Result not committed');
      if (!controller.signal.aborted) { setResult(response.result); clearSubmission(projectId, quiz.id); onSubmitted(); }
    } catch (e) { if (!controller.signal.aborted) setError(errorText(e)); }
    finally { flight.current = null; if (!controller.signal.aborted) setBusy(false); }
  }
  const feedback = new Map(result?.items.map(i => [i.itemId, i]) ?? []);
  return <form aria-label="自测练习" onSubmit={e => { e.preventDefault(); void submit(); }}>
    <header className="lh-quiz-heading"><div className="lh-eyebrow">COURSE PRACTICE</div><div role="heading" aria-level={2} className="lh-content-heading"><LearningContent text={quiz.purpose}/></div>
      {result ? <p role="status">已完成 · 答对 {result.correctCount}/{result.itemCount} 题</p> : <p className="lh-muted">{quiz.items.length} 道题 · 请完成所有题目后提交</p>}</header>
    {quiz.items.map((item, index) => {
      const f = feedback.get(item.id);
      const promptId = `${questionPrefix}-${index}`;
      return <fieldset key={item.id} className="lh-question" aria-describedby={promptId} disabled={busy || !!pending || !!result}>
        <legend><span className="lh-eyebrow">QUESTION {index + 1} / {quiz.items.length}</span></legend>
        <LearningContent id={promptId} className="lh-prompt" text={item.prompt}/>
        <div className="lh-options">{item.options.map((option, n) => <label key={n} className="lh-option">
          <input type="radio" name={`${quiz.id}:${item.id}`} value={n} checked={(f?.selectedOption ?? answers[item.id]) === n}
            onChange={() => setAnswers(a => ({ ...a, [item.id]: n }))}/><span className="lh-option-letter">{String.fromCharCode(65 + n)}</span><LearningContent text={option}/>
        </label>)}</div>
        {f && <div className="lh-feedback"><Tag tone={f.correct ? 'success' : 'warning'}>{f.correct ? '答对了' : '需要再想一想 · 答错'}</Tag>
          <LearningContent text={`你的答案：${String.fromCharCode(65 + f.selectedOption)} · ${item.options[f.selectedOption]}`}/>
          <LearningContent text={`正确答案：${String.fromCharCode(65 + f.correctOption)} · ${item.options[f.correctOption]}`}/><LearningContent text={f.explanation}/>
          <LearningContent className="lh-muted" text={`知识点：${conceptNames(item.conceptIds, concepts)}`}/>
        </div>}
      </fieldset>;
    })}
    {!result && <div className="lh-submit">
      {pending && !busy && !error && <p role="status">上次提交结果待确认，请使用原答案重试。</p>}
      {error && <Failure message={`${error} 原答案已保留，重试不会重复计分。`} retry={() => void submit()}/>}
      <Button variant="primary" type="submit" disabled={busy || (!pending && quiz.items.some(i => answers[i.id] === undefined))}>
        {busy ? '正在提交…' : pending ? '重试提交原答案' : '提交练习'}</Button>
    </div>}
  </form>;
}
