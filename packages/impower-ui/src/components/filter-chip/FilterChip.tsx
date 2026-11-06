import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";

export const filterChipVariants = cva(
  [
    "relative control-overlay inline-flex shrink-0 cursor-pointer items-center whitespace-nowrap rounded-control select-none",
    "[&>svg]:flex-none",
    "aria-[pressed=false]:text-muted",
  ],
  {
    variants: {
      tone: {
        error: "text-error",
        warning: "text-warning",
        info: "text-ink",
      },
      size: {
        default: "h-11 gap-1.5 pr-2.5 pl-2 text-[12px]/[1.6] [&>svg]:size-[15px]",
      },
    },
    defaultVariants: { tone: "info", size: "default" },
  },
);

export type FilterChipTone = NonNullable<
  VariantProps<typeof filterChipVariants>["tone"]
>;
export type FilterChipSize = NonNullable<
  VariantProps<typeof filterChipVariants>["size"]
>;

export type FilterChipProps = VariantProps<typeof filterChipVariants> & {
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
  icon?: ComponentChildren;
  children: ComponentChildren;
  class?: string;
} & Omit<
    JSX.HTMLAttributes<HTMLButtonElement>,
    "class" | "icon" | "size" | "onClick" | "aria-pressed"
  >;

export default function FilterChip({
  pressed,
  onPressedChange,
  icon,
  children,
  tone,
  size,
  class: className,
  ...rest
}: FilterChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      class={cn(filterChipVariants({ tone, size }), className)}
      onClick={() => onPressedChange(!pressed)}
      {...rest}
    >
      {icon}
      <span>{children}</span>
    </button>
  );
}
