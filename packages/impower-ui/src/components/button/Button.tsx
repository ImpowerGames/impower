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

export const buttonVariants = cva(
  [
    "relative",
    "inline-flex flex-row items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium select-none cursor-pointer pointer-events-auto",
    "transition-[color,background-color,border-color,box-shadow] duration-100",
    "outline-none focus-visible:[outline:3px_solid_#0c4a6e] focus-visible:[outline-offset:-3px]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        primary:
          `bg-primary text-background before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12] ${FILLED_SHADOW}`,
        secondary:
          `bg-engine-700 text-foreground before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12] ${FILLED_SHADOW}`,
        outline:
          "border-solid border border-foreground bg-transparent text-foreground hover:bg-foreground/5 active:bg-foreground/[0.12]",
        ghost:
          "bg-transparent text-foreground hover:bg-foreground/5 active:bg-foreground/[0.12]",
        link: "bg-transparent text-primary underline-offset-4 hover:underline h-auto px-0 py-0",
        destructive:
          `bg-danger-500 text-foreground before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12] ${FILLED_SHADOW}`,
        fab: `bg-engine-700 text-white before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12] ${FILLED_SHADOW}`,
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Comp: any = asChild ? Slot : "button";
  const extraProps = asChild ? {} : { type };
  return (
    <Comp
      ref={ref as Ref<HTMLButtonElement>}
      class={cn(buttonVariants({ variant, size }), className)}
      {...extraProps}
      {...rest}
    >
      {children}
      {
}
      {!asChild && <Ripple />}
    </Comp>
  );
});

export default Button;
