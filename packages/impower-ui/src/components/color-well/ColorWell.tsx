import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { cn } from "../../utils/cn";
import { PipetteIcon } from "../icon/icons.generated";

export const colorWellVariants = cva(
  [
    "relative grid shrink-0 cursor-pointer place-items-center",
    "bg-[var(--swatch)] text-[lch(from_var(--swatch)_calc((50_-_l)_*_1000)_0_0)]",
    "shadow-[inset_0_0_0_1px_var(--swatch-edge)] [forced-color-adjust:none]",
    "has-[:focus-visible]:outline has-[:focus-visible]:outline-1 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-accent",
    "[&_svg]:motion-safe:transition-transform [&_svg]:motion-safe:duration-120",
    "[@media(hover:hover)]:hover:[&_svg]:scale-110",
  ],
  {
    variants: {
      size: {
        default:
          "size-14 rounded-[12px] [&_svg]:size-6 compact:size-11 compact:rounded-[10px] compact:[&_svg]:size-5 phone:size-11 phone:rounded-[10px] phone:[&_svg]:size-5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type ColorWellSize = NonNullable<VariantProps<typeof colorWellVariants>["size"]>;

export type ColorWellProps = VariantProps<typeof colorWellVariants> & {
  value: string;
  label: string;
  class?: string;
  disabled?: boolean;
  onValueChange?: (value: string) => void;
};

export default function ColorWell({
  value,
  label,
  size,
  class: className,
  disabled,
  onValueChange,
}: ColorWellProps) {
  return (
    <label
      class={cn(colorWellVariants({ size }), className)}
      style={{ "--swatch": value } as JSX.CSSProperties}
      title={label}
    >
      <PipetteIcon />
      <input
        type="color"
        class="absolute inset-0 m-0 size-full cursor-pointer border-0 p-0 opacity-0"
        value={value}
        aria-label={label}
        disabled={disabled}
        onInput={(event) => onValueChange?.(event.currentTarget.value)}
      />
    </label>
  );
}
