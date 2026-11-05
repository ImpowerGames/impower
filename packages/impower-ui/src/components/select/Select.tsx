import { cva, type VariantProps } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";
import { ChevronDownIcon } from "../icon/icons.generated";

export const selectVariants = cva(
  [
    "relative m-0 min-w-0 cursor-pointer appearance-none truncate",
    "rounded-control border border-solid border-edge bg-bg text-ink control-wash",
    "motion-safe:transition-[border-color] motion-safe:duration-140",
    "disabled:cursor-default disabled:opacity-40",
    "forced-colors:appearance-auto",
  ],
  {
    variants: {
      size: {
        default: "min-h-9 py-1.5 pr-7 pl-2.5 text-[13px]/[1.4] font-normal",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type SelectSize = NonNullable<VariantProps<typeof selectVariants>["size"]>;

export type SelectOption<V extends string = string> = {
  readonly value: V;
  readonly label: string;
  readonly disabled?: boolean;
};

export type SelectProps<V extends string = string> = Omit<
  JSX.SelectHTMLAttributes<HTMLSelectElement>,
  "size" | "value" | "defaultValue" | "onChange" | "multiple"
> &
  VariantProps<typeof selectVariants> & {
    class?: string;
    options: readonly SelectOption<V>[];
    value?: V;
    defaultValue?: V;
    disabled?: boolean;
    onValueChange?: (value: V) => void;
  };

const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { size, class: className, options, value, defaultValue, onValueChange, ...rest },
  ref,
) {
  const controlled = value !== undefined;
  const selected = controlled ? value : defaultValue;
  return (
    <span class={cn("relative inline-flex min-w-0 shrink-0", className)}>
      <select
        ref={ref as Ref<HTMLSelectElement>}
        class={cn(selectVariants({ size }), "w-full")}
        {...rest}
        value={controlled ? value : undefined}
        onChange={(event) => {
          const select = event.currentTarget;
          const next = select.value;
          if (controlled) {
            select.value = value;
          }
          onValueChange?.(next);
        }}
      >
        {options.map((option) => (
          <option
            key={option.value}
            value={option.value}
            disabled={option.disabled}
            selected={!controlled && option.value === selected ? true : undefined}
          >
            {option.label}
          </option>
        ))}
      </select>
      <ChevronDownIcon
        aria-hidden="true"
        class="pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted forced-colors:hidden"
      />
    </span>
  );
});

export default Select as <V extends string = string>(
  props: SelectProps<V> & { ref?: Ref<HTMLSelectElement> },
) => JSX.Element;
