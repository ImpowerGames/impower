import { cva, type VariantProps } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";

const keysChipTarget =
  "group/keys -my-1 inline-flex min-h-11 shrink-0 cursor-pointer items-center border-0 bg-transparent p-0 outline-none";

export const keysChipVariants = cva(
  [
    "inline-flex min-h-9 items-center gap-1 rounded-[8px] border border-solid bg-bg py-1",
    "font-sans text-[13px]/[1.4] font-normal",
    "motion-safe:transition-[border-color,color] motion-safe:duration-140",
    "group-focus-visible/keys:outline-2 group-focus-visible/keys:outline-offset-2",
    "group-focus-visible/keys:outline-solid group-focus-visible/keys:outline-accent",
  ],
  {
    variants: {
      state: {
        keys: "border-edge px-1.5 text-ink",
        none: "border-edge px-3 text-muted",
        recording: "border-accent px-3 text-accent",
      },
    },
    defaultVariants: {
      state: "keys",
    },
  },
);

export type KeysChipState = NonNullable<
  VariantProps<typeof keysChipVariants>["state"]
>;

export type KeysChipProps = Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "type" | "children"
> & {
  keys: readonly string[];
  recording?: boolean;
  noneLabel?: string;
  recordingLabel?: string;
  class?: string;
};

const KeysChip = forwardRef<HTMLButtonElement, KeysChipProps>(function KeysChip(
  {
    keys,
    recording = false,
    noneLabel = "None",
    recordingLabel = "Press keys…",
    class: className,
    ...rest
  },
  ref,
) {
  const state: KeysChipState = recording ? "recording" : keys.length ? "keys" : "none";
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      type="button"
      data-keys-chip={state}
      class={cn(keysChipTarget, className)}
      {...rest}
    >
      <span class={keysChipVariants({ state })}>
        {state === "recording" ? (
          <span>{recordingLabel}</span>
        ) : state === "none" ? (
          noneLabel
        ) : (
          keys.map((key, index) => (
            <kbd
              key={`${index}-${key}`}
              class="inline-flex min-w-[26px] items-center justify-center rounded-[6px] border border-b-2 border-solid border-edge bg-elevated px-[7px] py-1 font-sans text-[12px]/[1.2] font-semibold text-ink"
            >
              {key}
            </kbd>
          ))
        )}
      </span>
    </button>
  );
});

export default KeysChip;
