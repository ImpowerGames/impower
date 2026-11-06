import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";
import { CheckIcon } from "../icon/icons.generated";

export const choiceGroupVariants = cva("", {
  variants: {
    variant: {
      segmented: "inline-flex shrink-0 rounded-control border border-solid border-edge bg-bg",
      tiles: "grid grid-cols-[repeat(auto-fill,minmax(176px,1fr))] gap-2.5 phone:grid-cols-1 phone:gap-2",
    },
    size: {
      default: "",
    },
  },
  compoundVariants: [{ variant: "segmented", size: "default", class: "gap-0.5 p-0.5" }],
  defaultVariants: {
    variant: "segmented",
    size: "default",
  },
});

export const choiceOptionVariants = cva(
  [
    "relative control-overlay select-none cursor-pointer",
    "motion-safe:transition-[background-color,border-color,color] motion-safe:duration-140",
    "peer-focus-visible:outline-1 peer-focus-visible:outline-accent peer-focus-visible:-outline-offset-1 peer-focus-visible:outline-solid",
    "forced-colors:peer-focus-visible:outline-[Highlight] forced-colors:peer-checked:outline-2 forced-colors:peer-checked:outline-[Highlight] forced-colors:peer-checked:outline-solid",
    "peer-disabled:cursor-default peer-disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        segmented: [
          "flex items-center justify-center whitespace-nowrap rounded-md text-muted",
          "peer-checked:bg-elevated peer-checked:text-ink",
        ],
        tiles: [
          "flex h-full min-w-0 flex-col gap-1.5 rounded-[10px] border border-solid border-edge bg-panel p-2 text-ink",
          "peer-checked:border-accent peer-checked:shadow-[inset_0_0_0_1px_var(--accent)]",
          "phone:grid phone:grid-cols-[80px_1fr] phone:grid-rows-[auto_auto] phone:items-center phone:gap-x-3 phone:gap-y-0.5 phone:px-2.5",
        ],
      },
      size: {
        default: "",
      },
    },
    compoundVariants: [
      { variant: "segmented", size: "default", class: "min-h-[30px] px-3 text-[13px]/[1.2] font-semibold" },
    ],
    defaultVariants: {
      variant: "segmented",
      size: "default",
    },
  },
);

export type ChoiceGroupVariant = NonNullable<VariantProps<typeof choiceGroupVariants>["variant"]>;
export type ChoiceGroupSize = NonNullable<VariantProps<typeof choiceGroupVariants>["size"]>;

export type ChoiceOption<V extends string = string> = {
  readonly value: V;
  readonly label: string;
  readonly detail?: string;
  readonly media?: ComponentChildren;
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

function TileContent({ option }: { option: ChoiceOption }) {
  return (
    <>
      {option.media && <span class="contents phone:*:row-span-2">{option.media}</span>}
      <span class="flex justify-between gap-1.5 text-[14px]/[1.4] font-semibold phone:self-end">
        {option.label}
        <CheckIcon
          aria-hidden="true"
          class="invisible size-4 flex-none self-center text-accent group-has-[:checked]/choice:visible"
        />
      </span>
      {option.detail && (
        <small class="text-[12px]/[1.5] text-muted phone:self-start phone:text-[11px]">
          {option.detail}
        </small>
      )}
    </>
  );
}

export default function ChoiceGroup<V extends string = string>({
  variant,
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
  const tiles = variant === "tiles";
  return (
    <span
      role="radiogroup"
      aria-disabled={disabled ? "true" : undefined}
      class={cn(choiceGroupVariants({ variant, size }), className)}
      {...rest}
    >
      {options.map((option) => (
        <label key={option.value} class="group/choice relative block min-w-0">
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
          <span class={choiceOptionVariants({ variant, size })}>
            {tiles ? <TileContent option={option} /> : option.label}
          </span>
        </label>
      ))}
    </span>
  );
}
