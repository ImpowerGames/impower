import type { ComponentChildren } from "preact";

export type EmptyStateProps = {
  icon: ComponentChildren;
  title: string;
  body?: string;
  action?: ComponentChildren;
};

export default function EmptyState({ icon, title, body, action }: EmptyStateProps) {
  return (
    <div class="flex flex-col items-center gap-3 px-5 py-14 text-center text-muted [&>svg]:size-8">
      {icon}
      <h2 class="text-[16px] font-medium text-ink">{title}</h2>
      {body && <p class="max-w-[340px] text-[13px]/[1.5]">{body}</p>}
      {action}
    </div>
  );
}
