import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";
import { PauseFillIcon, PlayIcon } from "../icon/icons.generated";

export const playButtonVariants = cva(
  [
    "relative control-overlay inline-flex flex-none items-center justify-center rounded-full",
    "cursor-pointer select-none border border-solid bg-transparent text-accent",
    "motion-safe:transition-[background-color,border-color] motion-safe:duration-140",
    "disabled:cursor-default disabled:opacity-40",
  ],
  {
    variants: {
      size: {
        row: "size-11 [&_svg]:size-[18px]",
        strip: "size-11 [&_svg]:size-[22px]",
        large: "size-[52px] [&_svg]:size-[18px]",
      },
      ring: {
        edge: "border-edge",
        accent: "border-accent",
      },
      playing: {
        true: "bg-tint",
        false: "",
      },
    },
    defaultVariants: { size: "row", ring: "edge", playing: false },
  },
);

export type PlayButtonRing = NonNullable<VariantProps<typeof playButtonVariants>["ring"]>;

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
  { name, playing = false, size, ring, class: className, ...rest },
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
      class={cn(playButtonVariants({ size, ring, playing }), className)}
      {...rest}
    >
      {playing ? <PauseFillIcon /> : <PlayIcon />}
    </button>
  );
});

export default PlayButton;
