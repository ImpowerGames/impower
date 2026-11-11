import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";

export const panelHeadVariants = cva("flex flex-none items-center gap-1 px-2.5", {
  variants: {
    size: {
      compact: "h-11",
      default: "min-h-[52px] py-1",
      tall: "h-[68px]",
    },
    edge: {
      true: "border-b border-edge",
      false: "",
    },
  },
  defaultVariants: { size: "default", edge: true },
});

const titleVariants = cva("m-0 min-w-0 truncate font-semibold text-ink", {
  variants: {
    titleSize: {
      sm: "text-[14px]/[1.4]",
      md: "text-[15px]/[1.4]",
    },
  },
  defaultVariants: { titleSize: "md" },
});

export type PanelHeadSize = NonNullable<VariantProps<typeof panelHeadVariants>["size"]>;
export type PanelHeadTitleSize = NonNullable<VariantProps<typeof titleVariants>["titleSize"]>;

export type PanelHeadProps = VariantProps<typeof panelHeadVariants> &
  VariantProps<typeof titleVariants> & {
    title: ComponentChildren;
    subtitle?: ComponentChildren;
    start?: ComponentChildren;
    end?: ComponentChildren;
    class?: string;
  };

export default function PanelHead({
  title,
  subtitle,
  start,
  end,
  size,
  edge,
  titleSize,
  class: className,
}: PanelHeadProps) {
  return (
    <header class={cn(panelHeadVariants({ size, edge }), className)} data-panel-head>
      {start}
      <div class="mx-1 flex min-w-0 flex-1 flex-col gap-px">
        {typeof title === "string" ? <h2 class={titleVariants({ titleSize })}>{title}</h2> : title}
        {subtitle ? <small class="truncate text-[11px]/[1.4] text-muted">{subtitle}</small> : null}
      </div>
      {end}
    </header>
  );
}
