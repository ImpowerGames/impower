import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";

const shortNumber = new Intl.NumberFormat("en", { notation: "compact" });

export const variantsLabel = (count: number): string =>
  `${shortNumber.format(count)} variant${count === 1 ? "" : "s"}`;

export const variantsChipVariants = cva(
  "inline-block flex-none rounded-full border border-edge align-[1px] font-semibold whitespace-nowrap text-muted",
  {
    variants: {
      size: {
        default: "px-[7px] text-[10px]/[1.5]",
        compact: "px-1.5 text-[9px]/[1.5]",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export type VariantsChipSize = NonNullable<VariantProps<typeof variantsChipVariants>["size"]>;

export type VariantsChipProps = VariantProps<typeof variantsChipVariants> & {
  count: number;
  class?: string;
};

export default function VariantsChip({ count, size, class: className }: VariantsChipProps) {
  const label = variantsLabel(count);
  return (
    <span class={cn(variantsChipVariants({ size }), className)} title={label} data-variants-chip>
      {label}
    </span>
  );
}
