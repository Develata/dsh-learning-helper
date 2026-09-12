import { Button, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import { statusLabels } from './model.js';
import type { StudentDashboard } from './types.js';
export function Failure({ message, retry }: { message: string; retry: () => void }) {
  return <div className="lh-error" role="alert"><p>{message}</p><Button variant="outline" onClick={retry}>重试</Button></div>;
}
export function Loading({ text = '正在读取课程…' }: { text?: string }) { return <p className="lh-muted" role="status">{text}</p>; }
export function Status({ status }: { status: StudentDashboard['concepts'][number]['status'] }) {
  return <Tag tone={status === 'weak' ? 'warning' : status === 'strong' || status === 'okay' ? 'success' : 'neutral'}>{statusLabels[status]}</Tag>;
}
