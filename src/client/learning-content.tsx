import { MarkdownText, type MarkdownLabels } from '@deepseek-ai/dsh-client-ui-primitives';

// Stable labels preserve the shared renderer's memoized settled parse on answer changes.
const labels: MarkdownLabels = { code: { copyLabel: '复制', copiedLabel: '已复制' }, footnotes: '注释' };

/** Display-only adapter. The public Harness renderer owns Markdown, safe TeX and fonts. */
export function LearningContent({ text, className = '', id }: { text: string; className?: string; id?: string }) {
  return <div id={id} className={`lh-content ${className}`}><MarkdownText text={text} labels={labels}/></div>;
}
