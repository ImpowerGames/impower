import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { cn } from "../../utils/cn";

export const colorChipVariants = cva(
  [
    "relative size-9 min-w-9 shrink-0 cursor-pointer rounded-[8px] border-0 p-0",
    "bg-[var(--swatch)] shadow-[inset_0_0_0_1px_var(--swatch-edge)] [forced-color-adjust:none]",
    "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
    "aria-pressed:outline aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-accent",
  ],
  {
    variants: {
      size: {
        default: "",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const listClasses = [
  "-m-1 flex max-h-[228px] flex-wrap gap-2 overflow-y-auto p-1",
  "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden [--fade:24px]",
  "compact:max-h-none compact:flex-nowrap compact:scroller-x compact:overflow-y-visible compact:pr-[calc(4px+var(--fade))] compact:[mask-image:linear-gradient(to_right,#000_calc(100%-var(--fade)),transparent)]",
  "phone:max-h-none phone:flex-nowrap phone:scroller-x phone:overflow-y-visible phone:pr-[calc(4px+var(--fade))] phone:[mask-image:linear-gradient(to_right,#000_calc(100%-var(--fade)),transparent)]",
];

export type ColorChipSize = NonNullable<VariantProps<typeof colorChipVariants>["size"]>;

export type ColorChipsProps = VariantProps<typeof colorChipVariants> & {
  label: string;
  colors: readonly string[];
  current?: string;
  class?: string;
  onSelect: (color: string) => void;
};

export default function ColorChips({
  label,
  colors,
  current,
  size,
  class: className,
  onSelect,
}: ColorChipsProps) {
  return (
    <div role="group" aria-label={label} class={cn(listClasses, className)}>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          class={colorChipVariants({ size })}
          style={{ "--swatch": color } as JSX.CSSProperties}
          aria-label={color}
          aria-pressed={color === current}
          title={color}
          data-color={color}
          onClick={() => onSelect(color)}
        />
      ))}
    </div>
  );
}
