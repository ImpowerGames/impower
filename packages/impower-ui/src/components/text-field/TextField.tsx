import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { forwardRef } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import { cn } from "../../utils/cn";

export const textFieldVariants = cva(
  [
    "m-0 min-w-0 shrink-0 text-ink",
    "placeholder:text-placeholder",
    "disabled:cursor-default disabled:opacity-40",
  ],
  {
    variants: {
      frame: {
        own: [
          "rounded-control border border-solid border-edge bg-bg control-wash",
          "motion-safe:transition-[border-color] motion-safe:duration-140",
        ],
        inset: "h-full border-0 bg-transparent outline-none",
      },
      size: {
        default: "min-h-9 px-2.5 py-1.5 text-[13px]/[1.4]",
        tall: "h-14 px-3 py-2 text-[16px]/[1.5] compact:h-11 phone:h-11",
      },
      width: {
        default: "w-[180px]",
        wide: "w-[300px]",
        short: "w-[140px]",
        full: "w-full",
      },
      font: {
        sans: "font-sans",
        mono: "font-mono",
      },
    },
    compoundVariants: [
      {
        frame: "inset",
        class: "min-h-0 w-auto flex-1 shrink p-0",
      },
    ],
    defaultVariants: {
      frame: "own",
      size: "default",
      width: "default",
      font: "sans",
    },
  },
);

export type TextFieldFrame = NonNullable<VariantProps<typeof textFieldVariants>["frame"]>;
export type TextFieldSize = NonNullable<VariantProps<typeof textFieldVariants>["size"]>;
export type TextFieldWidth = NonNullable<VariantProps<typeof textFieldVariants>["width"]>;
export type TextFieldFont = NonNullable<VariantProps<typeof textFieldVariants>["font"]>;

export type TextFieldProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "size" | "width" | "value" | "defaultValue" | "type" | "onChange"
> &
  VariantProps<typeof textFieldVariants> & {
    class?: string;
    type?: "text" | "search" | "url" | "email" | "tel" | "password";
    value?: string;
    defaultValue?: string;
    disabled?: boolean;
    onValueChange?: (value: string) => void;
    onCommit?: (value: string) => void;
  };

const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  {
    frame,
    size,
    width,
    font,
    class: className,
    type = "text",
    value,
    defaultValue,
    onValueChange,
    onCommit,
    onInput,
    ...rest
  },
  ref,
) {
  const own = useRef<HTMLInputElement | null>(null);
  const commit = useRef(onCommit);
  commit.current = onCommit;
  const controlled = useRef(value);
  controlled.current = value;

  useEffect(() => {
    const input = own.current;
    if (!input) {
      return;
    }
    const onChange = () => commit.current?.(controlled.current ?? input.value);
    input.addEventListener("change", onChange);
    return () => input.removeEventListener("change", onChange);
  }, []);

  return (
    <input
      ref={(element: HTMLInputElement | null) => {
        own.current = element;
        if (typeof ref === "function") {
          ref(element);
        } else if (ref) {
          (ref as { current: HTMLInputElement | null }).current = element;
        }
      }}
      type={type}
      class={cn(textFieldVariants({ frame, size, width, font }), className)}
      autocomplete="off"
      spellcheck={false}
      {...rest}
      {...(value !== undefined ? { value, defaultValue: value } : { defaultValue })}
      onInput={(event) => {
        const input = event.currentTarget;
        onInput?.(event);
        onValueChange?.(input.value);
        if (value !== undefined) {
          setTimeout(() => {
            const owned = controlled.current;
            if (owned !== undefined && input.value !== owned) {
              input.value = owned;
            }
          }, 0);
        }
      }}
    />
  );
});

export default TextField;
