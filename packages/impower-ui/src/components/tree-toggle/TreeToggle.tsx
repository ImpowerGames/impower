import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import { ChevronDownIcon } from "../icon/icons.generated";

export const treeToggleVariants = cva(
  [
    "relative control-overlay inline-flex size-11 flex-none cursor-pointer items-center justify-center rounded-control text-muted focus-inset",
    "[&_svg]:size-3.5 [&_svg]:motion-safe:transition-transform [&_svg]:motion-safe:duration-180",
  ],
  {
    variants: {
      expanded: {
        true: "",
        false: "[&_svg]:-rotate-90",
      },
    },
    defaultVariants: { expanded: true },
  },
);

export type TreeToggleProps = Omit<
  VariantProps<typeof treeToggleVariants>,
  "expanded"
> & {
  expanded: boolean;
  label: string;
  onToggle: () => void;
  class?: string;
};

export default function TreeToggle({
  expanded,
  label,
  onToggle,
  class: className,
}: TreeToggleProps) {
  return (
    <button
      type="button"
      class={cn(treeToggleVariants({ expanded }), className)}
      aria-expanded={expanded}
      aria-label={label}
      title={label}
      onClick={onToggle}
    >
      <ChevronDownIcon />
    </button>
  );
}
