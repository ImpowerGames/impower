import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { forwardRef } from "preact/compat";
import { useRef } from "preact/hooks";
import { cn } from "../../utils/cn";

export const sliderVariants = cva(
  [
    "m-0 block min-w-0 cursor-pointer accent-accent",
    "rounded-control",
    "disabled:cursor-default disabled:opacity-40",
  ],
  {
    variants: {
      size: {
        default: "min-h-11",
      },
      width: {
        full: "w-full",
        default: "w-[180px]",
      },
      track: {
        default: "",
        opacity: "slider-opacity-track",
      },
    },
    defaultVariants: {
      size: "default",
      width: "full",
      track: "default",
    },
  },
);

export type SliderSize = NonNullable<VariantProps<typeof sliderVariants>["size"]>;
export type SliderWidth = NonNullable<VariantProps<typeof sliderVariants>["width"]>;
export type SliderTrack = NonNullable<VariantProps<typeof sliderVariants>["track"]>;

export type SliderProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "size" | "width" | "value" | "defaultValue" | "min" | "max" | "step" | "onChange"
> &
  VariantProps<typeof sliderVariants> & {
    class?: string;
    value?: number;
    defaultValue?: number;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    valueText?: (value: number) => string;
    onValueChange?: (value: number) => void;
  };

const Slider = forwardRef<HTMLInputElement, SliderProps>(function Slider(
  {
    size,
    width,
    track,
    class: className,
    value,
    defaultValue,
    min = 0,
    max = 100,
    step = 1,
    valueText,
    onValueChange,
    onInput,
    ...rest
  },
  ref,
) {
  const controlled = value !== undefined;
  const latest = useRef(value);
  latest.current = value;
  const shown = controlled ? value : defaultValue;
  return (
    <input
      ref={ref}
      type="range"
      class={cn(sliderVariants({ size, width, track }), className)}
      min={min}
      max={max}
      step={step}
      {...rest}
      {...(controlled ? { value, defaultValue: value } : { defaultValue })}
      {...(valueText && shown !== undefined ? { "aria-valuetext": valueText(shown) } : {})}
      onInput={(event) => {
        const input = event.currentTarget;
        onInput?.(event);
        const next = Number(input.value);
        if (valueText && !controlled) {
          input.setAttribute("aria-valuetext", valueText(next));
        }
        onValueChange?.(next);
        if (controlled) {
          setTimeout(() => {
            const owned = latest.current;
            if (owned !== undefined && input.value !== String(owned)) {
              input.value = String(owned);
            }
          }, 0);
        }
      }}
    />
  );
});

export default Slider;
