import { cva, type VariantProps } from "class-variance-authority";
import type { JSX } from "preact";
import { forwardRef } from "preact/compat";
import { useEffect, useRef } from "preact/hooks";
import { cn } from "../../utils/cn";

export const textFieldVariants = cva(
  [
    "m-0 min-w-0 shrink-0",
    "rounded-control border border-solid border-edge bg-bg text-ink control-wash",
    "placeholder:text-placeholder",
    "motion-safe:transition-[border-color] motion-safe:duration-140",
    "disabled:cursor-default disabled:opacity-40",
  ],
  {
    variants: {
      size: {
        default: "min-h-9 px-2.5 py-1.5 text-[13px]/[1.4]",
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
    defaultVariants: {
      size: "default",
      width: "default",
      font: "sans",
    },
  },
);

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
      class={cn(textFieldVariants({ size, width, font }), className)}
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
