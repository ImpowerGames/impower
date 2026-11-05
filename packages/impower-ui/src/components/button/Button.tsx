import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";
import Ripple from "../ripple/Ripple";

const FILLED_SHADOW =
  "shadow-[0_1px_1.5px_hsl(0_0%_0%/0.24),0_1px_1px_hsl(0_0%_0%/0.48)] " +
  "hover:shadow-[0_3px_3px_hsl(0_0%_0%/0.32),0_3px_3px_hsl(0_0%_0%/0.46)] " +
  "active:shadow-none";

const FILLED_OVERLAY =
  "before:pointer-events-none before:absolute before:inset-0 before:rounded-[inherit] before:bg-current before:opacity-0 " +
  "hover:before:opacity-[0.05] active:before:opacity-[0.12]";

const UNFILLED_OVERLAY =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-current after:opacity-0 " +
  "hover:after:opacity-[0.05] active:after:opacity-[0.12]";

export const buttonVariants = cva(
  [
    "relative",
    "inline-flex items-center justify-center gap-2 whitespace-nowrap [&_svg]:shrink-0",
    "rounded-md text-sm font-medium select-none cursor-pointer",
    "transition-[color,background-color,border-color,box-shadow] duration-100",
    "outline-none focus-visible:[outline:3px_solid_var(--focus-ring)] focus-visible:[outline-offset:-3px]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        primary:
          `bg-primary text-background ${FILLED_OVERLAY} ${FILLED_SHADOW}`,
        secondary:
          `bg-button-bg text-button-ink ${FILLED_OVERLAY} ${FILLED_SHADOW}`,
        outline: `border border-foreground bg-transparent text-foreground ${UNFILLED_OVERLAY}`,
        ghost: `bg-transparent text-foreground ${UNFILLED_OVERLAY}`,
        link: "bg-transparent text-primary underline-offset-4 hover:underline",
        destructive:
          `bg-error-strong text-foreground ${FILLED_OVERLAY} ${FILLED_SHADOW}`,
        fab: `bg-button-bg text-button-ink ${FILLED_OVERLAY} ${FILLED_SHADOW}`,
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-sm",
        xs: "h-7 rounded px-2 text-xs",
        lg: "h-12 rounded px-5 text-base",
        icon: "size-10 p-0",
        "icon-lg": "size-12 rounded-full p-0",
        fab: "h-12 w-full rounded-full px-5 text-base font-normal",
      },
    },
    compoundVariants: [{ variant: "link", class: "size-auto p-0" }],
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);

export type ButtonVariant = NonNullable<
  VariantProps<typeof buttonVariants>["variant"]
>;
export type ButtonSize = NonNullable<
  VariantProps<typeof buttonVariants>["size"]
>;

export type ButtonProps = Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "size" | "type"
> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    class?: string;
    type?: "button" | "submit" | "reset";
    disabled?: boolean;
    children?: ComponentChildren;
  };

const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, asChild, class: className, type = "button", children, ...rest },
  ref,
) {
  const classes = cn(buttonVariants({ variant, size }), className);
  if (asChild) {
    return (
      <Slot ref={ref as Ref<HTMLElement>} class={classes} {...rest}>
        {children}
      </Slot>
    );
  }
  return (
    <button
      ref={ref as Ref<HTMLButtonElement>}
      class={classes}
      type={type}
      {...rest}
    >
      {children}
      <Ripple />
    </button>
  );
});

export default Button;
