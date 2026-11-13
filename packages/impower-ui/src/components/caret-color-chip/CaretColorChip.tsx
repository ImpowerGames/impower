import { cva, type VariantProps } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";

const caretColorChipTarget =
  "group/caret-color inline-flex min-h-11 min-w-0 max-w-full shrink cursor-pointer items-center border-0 bg-transparent p-0 text-ink outline-none select-none [touch-action:manipulation]";

export const caretColorChipVariants = cva(
  [
    "inline-flex min-w-0 max-w-full items-center gap-[7px] rounded-full border border-solid border-edge bg-transparent px-3",
    "font-sans text-[12px]/[1] font-normal whitespace-nowrap",
    "group-hover/caret-color:bg-control-hover group-active/caret-color:bg-control-hover",
    "group-focus-visible/caret-color:outline-2 group-focus-visible/caret-color:outline-offset-2",
    "group-focus-visible/caret-color:outline-solid group-focus-visible/caret-color:outline-accent",
  ],
  {
    variants: {
      size: {
        default: "min-h-10",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type CaretColorChipSize = NonNullable<
  VariantProps<typeof caretColorChipVariants>["size"]
>;

export type CaretColorChipProps = VariantProps<typeof caretColorChipVariants> &
  Omit<JSX.HTMLAttributes<HTMLButtonElement>, "type" | "children" | "size"> & {
    color: string;
    value: string;
    class?: string;
  };

export const CaretColorChip = forwardRef<HTMLButtonElement, CaretColorChipProps>(
  function CaretColorChip(
    { color, value, size, class: className, ...rest },
    ref,
  ) {
    const label = `Change color ${value}`;
    return (
      <button
        ref={ref as Ref<HTMLButtonElement>}
        type="button"
        data-caret-color-chip=""
        aria-label={label}
        title={label}
        class={cn(caretColorChipTarget, className)}
        {...rest}
      >
        <span class={caretColorChipVariants({ size })}>
          <span
            data-caret-color-swatch=""
            class="size-3.5 flex-none rounded-[4px] bg-[var(--swatch)] shadow-[inset_0_0_0_1px_var(--swatch-edge)] [forced-color-adjust:none]"
            style={{ "--swatch": color } as JSX.CSSProperties}
          />
          <span class="min-w-0 truncate">{value}</span>
        </span>
      </button>
    );
  },
);

export default CaretColorChip;
