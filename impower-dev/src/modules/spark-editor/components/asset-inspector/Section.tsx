import type { ComponentChildren } from "preact";

export default function Section({
  title,
  aside,
  label,
  children,
}: {
  title: string;
  aside?: ComponentChildren;
  label: string;
  children: ComponentChildren;
}) {
  return (
    <section aria-label={label} class="min-w-0">
      <div class="mb-2 flex items-center justify-between gap-3 border-b border-edge pb-2">
        <h3 class="m-0 text-[13px]/[1.4] font-semibold text-ink">{title}</h3>
        {typeof aside === "string" ? <span class="text-[11px] text-muted">{aside}</span> : aside}
      </div>
      {children}
    </section>
  );
}
