import { cva, type VariantProps } from "class-variance-authority";
import type { JSX, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";

export const switchVariants = cva(
  [
    "relative m-0 shrink-0 cursor-pointer appearance-none",
    "rounded-full border border-solid border-edge bg-elevated control-wash",
    "before:absolute before:rounded-full before:bg-muted before:content-['']",
    "after:absolute after:content-['']",
    "checked:border-accent checked:bg-accent checked:before:bg-accent-ink checked:focus-inset",
    "motion-safe:transition-[background-color,border-color] motion-safe:duration-150 motion-safe:ease-[ease]",
    "motion-safe:before:transition-[left] motion-safe:before:duration-150 motion-safe:before:ease-[ease]",
    "disabled:cursor-default disabled:opacity-40",
    "forced-colors:appearance-auto forced-colors:before:content-none",
  ],
  {
    variants: {
      size: {
        default: [
          "h-6 w-10",
          "before:top-[3px] before:left-[3px] before:size-4 checked:before:left-[19px]",
          "after:-inset-x-0.5 after:-inset-y-2.5",
        ],
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type SwitchSize = NonNullable<VariantProps<typeof switchVariants>["size"]>;

export type SwitchProps = Omit<
  JSX.InputHTMLAttributes<HTMLInputElement>,
  "type" | "role" | "size" | "checked" | "defaultChecked" | "onChange"
> &
  VariantProps<typeof switchVariants> & {
    class?: string;
    checked?: boolean;
    defaultChecked?: boolean;
    disabled?: boolean;
    onCheckedChange?: (checked: boolean) => void;
  };

const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { size, class: className, checked, defaultChecked, onCheckedChange, ...rest },
  ref,
) {
  const controlled = checked !== undefined;
  return (
    <input
      ref={ref as Ref<HTMLInputElement>}
      type="checkbox"
      role="switch"
      class={cn(switchVariants({ size }), className)}
      {...rest}
      {...(controlled ? { checked } : { defaultChecked })}
      aria-checked={controlled ? checked : !!defaultChecked}
      onChange={(event) => {
        const input = event.currentTarget;
        const next = input.checked;
        if (controlled) {
          input.checked = checked;
        } else {
          input.setAttribute("aria-checked", String(next));
        }
        onCheckedChange?.(next);
      }}
    />
  );
});

export default Switch;
