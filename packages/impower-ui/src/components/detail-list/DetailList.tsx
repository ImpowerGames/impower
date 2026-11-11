import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { cn } from "../../utils/cn";

export const detailListVariants = cva(
  "m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 [&>dt]:text-muted [&>dd]:m-0 [&>dd]:text-ink [&>dd]:[overflow-wrap:anywhere]",
  {
    variants: {
      size: {
        sm: "gap-y-1.5 text-[12px]/[1.5]",
        md: "gap-y-2 text-[14px]/[1.5]",
      },
    },
    defaultVariants: { size: "sm" },
  },
);

export type DetailListSize = NonNullable<VariantProps<typeof detailListVariants>["size"]>;

export type DetailListRow = { label: string; value: ComponentChildren };

export type DetailListProps = VariantProps<typeof detailListVariants> & {
  rows: readonly DetailListRow[];
  label?: string;
  class?: string;
};

export default function DetailList({ rows, size, label, class: className }: DetailListProps) {
  return (
    <dl class={cn(detailListVariants({ size }), className)} aria-label={label} data-detail-list>
      {rows.map((row) => [<dt key={`${row.label}:term`}>{row.label}</dt>, <dd key={`${row.label}:value`}>{row.value}</dd>])}
    </dl>
  );
}
