import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";

export const disclosureVariants = cva("", {
  variants: {
    size: {
      default: "px-4",
    },
    edge: {
      none: "",
      top: "border-t border-solid border-edge",
    },
  },
  defaultVariants: {
    size: "default",
    edge: "none",
  },
});

export const disclosureSummaryVariants = cva(
  "cursor-pointer text-muted outline-none focus-visible:rounded-[4px] focus-visible:ring-2 focus-visible:ring-accent",
  {
    variants: {
      size: {
        default: "min-h-5 py-3 text-[13px]/5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type DisclosureSize = NonNullable<VariantProps<typeof disclosureVariants>["size"]>;
export type DisclosureEdge = NonNullable<VariantProps<typeof disclosureVariants>["edge"]>;

export type DisclosureProps = VariantProps<typeof disclosureVariants> & {
  summary: ComponentChildren;
  children: ComponentChildren;
  class?: string;
};

export default function Disclosure({ summary, children, size, edge, class: className }: DisclosureProps) {
  return (
    <details data-disclosure class={cn(disclosureVariants({ size, edge }), className)}>
      <summary class={disclosureSummaryVariants({ size })}>{summary}</summary>
      {children}
    </details>
  );
}
