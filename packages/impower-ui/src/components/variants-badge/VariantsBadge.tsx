import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { LayersIcon } from "../icon/icons.generated";
import { variantsLabel } from "../variants-chip/VariantsChip";

const shortNumber = new Intl.NumberFormat("en", { notation: "compact" });

export const variantsBadgeVariants = cva(
  "pointer-events-none inline-flex flex-none items-center gap-[3px] rounded-full bg-media-badge font-semibold text-media-badge-ink",
  {
    variants: {
      size: {
        default: "py-0.5 pr-[7px] pl-[5px] text-[10px]/[1.4] [&>svg]:size-3",
        compact: "py-px pr-1.5 pl-1 text-[9px]/[1.4] [&>svg]:size-2.5",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export type VariantsBadgeSize = NonNullable<VariantProps<typeof variantsBadgeVariants>["size"]>;

export type VariantsBadgeProps = VariantProps<typeof variantsBadgeVariants> & {
  count: number;
  class?: string;
};

export default function VariantsBadge({ count, size, class: className }: VariantsBadgeProps) {
  const label = variantsLabel(count);
  return (
    <span
      class={cn(variantsBadgeVariants({ size }), className)}
      role="img"
      aria-label={label}
      title={label}
      data-variants-badge
    >
      <LayersIcon aria-hidden="true" />
      <span aria-hidden="true">{shortNumber.format(count)}</span>
    </span>
  );
}
