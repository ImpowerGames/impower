import type { ComponentChildren } from "preact";

export type EmptyStateProps = {
  icon: ComponentChildren;
  title: string;
  action?: ComponentChildren;
};

export default function EmptyState({ icon, title, action }: EmptyStateProps) {
  return (
    <div class="flex min-h-0 flex-col items-center gap-3 overflow-y-auto px-5 py-14 text-center text-muted [&>svg]:size-8">
      {icon}
      <h2 class="text-[16px] font-medium text-ink">{title}</h2>
      {action}
    </div>
  );
}
