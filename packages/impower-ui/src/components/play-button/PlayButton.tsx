import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";
import { PauseFillIcon, PlayIcon } from "../icon/icons.generated";

export const playButtonVariants = cva(
  [
    "relative control-overlay inline-flex flex-none items-center justify-center rounded-full",
    "cursor-pointer select-none border border-solid border-edge bg-transparent text-accent",
    "motion-safe:transition-[background-color,border-color] motion-safe:duration-140",
    "disabled:cursor-default disabled:opacity-40",
    "[&_svg]:size-[18px]",
  ],
  {
    variants: {
      size: {
        row: "size-11",
        large: "size-[52px]",
      },
      playing: {
        true: "bg-tint",
        false: "",
      },
    },
    defaultVariants: { size: "row", playing: false },
  },
);

export type PlayButtonSize = NonNullable<VariantProps<typeof playButtonVariants>["size"]>;

export type PlayButtonProps = Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "size" | "type" | "name" | "children"
> &
  VariantProps<typeof playButtonVariants> & {
    name: string;
    playing?: boolean;
    disabled?: boolean;
    class?: string;
  };

const PlayButton = forwardRef<HTMLButtonElement, PlayButtonProps>(function PlayButton(
  { name, playing = false, size, class: className, ...rest },
  ref,
) {
  const label = `${playing ? "Pause" : "Play"} ${name}`;
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      title={label}
      data-playing={playing || undefined}
      class={cn(playButtonVariants({ size, playing }), className)}
      {...rest}
    >
      {playing ? <PauseFillIcon /> : <PlayIcon />}
    </button>
  );
});

export default PlayButton;
