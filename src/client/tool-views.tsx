import { Button } from '@deepseek-ai/dsh-client-ui-primitives';
import type { ToolCallOwnerProps } from '@deepseek-ai/dsh-client-ui-tool/client';
import type { Navigation } from './types.js';
import { toolCardModel, type LearningToolName } from './tool-model.js';
import { LearningContent } from './learning-content.js';
/** Rendering is pure for live calls and replay. Only explicit buttons navigate. */
export function LearningToolCard({ name, block, open }: { name: LearningToolName; block: ToolCallOwnerProps['block']; open: (navigation: Navigation) => void }) {
  const model = toolCardModel(name, block);
  return <section className="lh-tool-card" aria-label={name === 'quiz_publish' ? '课程练习工具卡片' : '学习工具卡片'}>
    <div className="lh-eyebrow">LEARNING HELPER</div><strong>{model.title}</strong>
    {!!model.lines.length && <ul>{model.lines.map((line, i) => <li key={i}><LearningContent text={line}/></li>)}</ul>}
    {model.navigation && <Button variant="outline" onClick={() => open(model.navigation!)}>{model.action}</Button>}
  </section>;
}
