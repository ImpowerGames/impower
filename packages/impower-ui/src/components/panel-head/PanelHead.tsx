import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";

export const panelHeadVariants = cva("flex flex-none items-center px-2.5", {
  variants: {
    spacing: {
      inset: "gap-1",
      open: "gap-1.5",
      flush: "gap-0",
    },
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
  defaultVariants: { spacing: "inset", size: "default", edge: true },
});

const panelHeadTitleColumnVariants = cva("flex min-w-0 flex-1 flex-col gap-px", {
  variants: {
    spacing: {
      inset: "mx-1",
      open: "",
      flush: "",
    },
  },
  defaultVariants: { spacing: "inset" },
});

export type PanelHeadSpacing = NonNullable<VariantProps<typeof panelHeadVariants>["spacing"]>;

export const panelHeadTitleVariants = cva("m-0 min-w-0 [--fade:20px] fade-edge font-semibold text-ink", {
  variants: {
    titleSize: {
      sm: "text-[14px]/[1.4]",
      md: "text-[15px]/[1.4]",
    },
  },
  defaultVariants: { titleSize: "md" },
});

export type PanelHeadSize = NonNullable<VariantProps<typeof panelHeadVariants>["size"]>;
export type PanelHeadTitleSize = NonNullable<VariantProps<typeof panelHeadTitleVariants>["titleSize"]>;

export type PanelHeadProps = VariantProps<typeof panelHeadVariants> &
  VariantProps<typeof panelHeadTitleVariants> & {
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
  spacing,
  size,
  edge,
  titleSize,
  class: className,
}: PanelHeadProps) {
  return (
    <header class={cn(panelHeadVariants({ spacing, size, edge }), className)} data-panel-head>
      {start}
      <div class={panelHeadTitleColumnVariants({ spacing })}>
        {typeof title === "string" ? <h2 class={panelHeadTitleVariants({ titleSize })}>{title}</h2> : title}
        {subtitle ? <small class="[--fade:20px] fade-edge text-[11px]/[1.6] text-muted">{subtitle}</small> : null}
      </div>
      {end}
    </header>
  );
}
