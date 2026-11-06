import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { cn } from "../../utils/cn";

export const choiceGroupVariants = cva(
  "inline-flex shrink-0 rounded-control border border-solid border-edge bg-bg",
  {
    variants: {
      size: {
        default: "gap-0.5 p-0.5",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export const choiceOptionVariants = cva(
  [
    "relative control-overlay flex items-center justify-center whitespace-nowrap select-none cursor-pointer",
    "rounded-md text-muted",
    "motion-safe:transition-[background-color,color] motion-safe:duration-140",
    "peer-checked:bg-elevated peer-checked:text-ink",
    "peer-focus-visible:outline-1 peer-focus-visible:outline-accent peer-focus-visible:-outline-offset-1 peer-focus-visible:outline-solid",
    "forced-colors:peer-focus-visible:outline-[Highlight] forced-colors:peer-checked:outline-2 forced-colors:peer-checked:outline-[Highlight] forced-colors:peer-checked:outline-solid",
    "peer-disabled:cursor-default peer-disabled:opacity-40",
  ],
  {
    variants: {
      size: {
        default: "min-h-[30px] px-3 text-[13px]/[1.2] font-semibold",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type ChoiceGroupSize = NonNullable<VariantProps<typeof choiceGroupVariants>["size"]>;

export type ChoiceOption<V extends string = string> = {
  readonly value: V;
  readonly label: string;
  readonly disabled?: boolean;
};

export type ChoiceGroupProps<V extends string = string> = Omit<
  JSX.HTMLAttributes<HTMLSpanElement>,
  "role" | "size" | "value" | "defaultValue" | "onChange"
> &
  VariantProps<typeof choiceGroupVariants> & {
    class?: string;
    name: string;
    options: readonly ChoiceOption<V>[];
    value?: V;
    defaultValue?: V;
    disabled?: boolean;
    onValueChange?: (value: V) => void;
  };

export default function ChoiceGroup<V extends string = string>({
  size,
  class: className,
  name,
  options,
  value,
  defaultValue,
  disabled,
  onValueChange,
  ...rest
}: ChoiceGroupProps<V>) {
  const controlled = value !== undefined;
  return (
    <span
      role="radiogroup"
      aria-disabled={disabled ? "true" : undefined}
      class={cn(choiceGroupVariants({ size }), className)}
      {...rest}
    >
      {options.map((option) => (
        <label key={option.value} class="relative block">
          <input
            class="peer absolute m-0 size-px appearance-none opacity-0"
            type="radio"
            name={name}
            value={option.value}
            disabled={disabled || option.disabled}
            {...(controlled
              ? { checked: option.value === value, defaultChecked: option.value === value }
              : { defaultChecked: option.value === defaultValue })}
            onChange={(event) => {
              const input = event.currentTarget;
              if (!input.checked) {
                return;
              }
              if (controlled) {
                input
                  .closest('[role="radiogroup"]')
                  ?.querySelectorAll<HTMLInputElement>('input[type="radio"]')
                  .forEach((radio) => {
                    radio.checked = radio.value === value;
                  });
              }
              onValueChange?.(option.value);
            }}
          />
          <span class={choiceOptionVariants({ size })}>{option.label}</span>
        </label>
      ))}
    </span>
  );
}
