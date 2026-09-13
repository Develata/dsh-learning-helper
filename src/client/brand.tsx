import type { Context } from '@deepseek-ai/cordis';
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client';
import type {} from '@deepseek-ai/dsh-client-ui-conversation/client';

/** Original book mark: decorative beside the visible product name. */
function LearningMark({ size, className }: { size: number; className?: string | undefined }) {
  return <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className={className}
    data-learning-helper-brand="mark" style={{ flexShrink: 0 }}>
    <path d="M16 8C12 5 7 5 3 6v20c4-1 9-1 13 2 4-3 9-3 13-2V6c-4-1-9-1-13 2Z"
      stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/>
    <path d="M16 8v20M7 11c2 0 4 .4 6 1.5M7 16c2 0 4 .4 6 1.5M20 15l2 2 4-5"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}

function SidebarMark({ size }: PropsRuntime<'sidebar.brand.mark'>) {
  return <LearningMark size={size}/>;
}
function HeroMark({ size, className }: PropsRuntime<'conversation.hero.brand.mark'>) {
  return <LearningMark size={size} className={className}/>;
}
function BrandName() {
  return <span data-learning-helper-brand="name" style={{ fontWeight: 650, whiteSpace: 'nowrap' }}>Learning Helper</span>;
}

/** Use the public presentation slots; retain the sidebar owner's navigation. */
export function registerLearningBrand(ctx: Context): void {
  // A lower priority intentionally shadows the official brand if it is mounted.
  ctx.slots.inject('sidebar.brand.mark', () => ctx.slots.register({ name: 'sidebar.brand.mark', priority: -10 }, SidebarMark));
  ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register({ name: 'sidebar.brand.name', priority: -10 }, BrandName));
  ctx.slots.inject('conversation.hero.brand.mark', () => ctx.slots.register({ name: 'conversation.hero.brand.mark', priority: -10 }, HeroMark));
}
