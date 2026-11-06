import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";

export const buttonVariants = cva(
  [
    "relative control-overlay",
    "inline-flex shrink-0 items-center justify-center whitespace-nowrap select-none cursor-pointer",
    "rounded-control border border-solid",
    "motion-safe:transition-[background-color,border-color] motion-safe:duration-140",
    "disabled:cursor-default disabled:opacity-40",
  ],
  {
    variants: {
      variant: {
        default: "border-edge bg-panel text-ink",
        primary: "border-accent bg-accent text-accent-ink focus-inset",
        quiet: "border-transparent bg-transparent text-ink",
        destructive: "border-error bg-error text-bg focus-inset",
        toggle: [
          "border-transparent bg-transparent text-muted text-[12px]/none font-semibold",
          "[&_u]:decoration-[1.5px] [&_u]:underline-offset-2",
          "aria-pressed:border-accent/45 aria-pressed:bg-tint aria-pressed:text-accent",
        ],
        disclosure: [
          "border-transparent bg-transparent text-muted aria-pressed:text-accent",
          "[&_svg]:motion-safe:transition-transform [&_svg]:motion-safe:duration-150 aria-pressed:[&_svg]:rotate-180",
        ],
      },
      size: {
        default:
          "min-h-11 min-w-11 gap-2 px-3 py-2 text-[13px]/[1.4] font-semibold [&_svg]:size-[18px]",
        icon: "size-11 p-0 [&_svg]:size-5",
        glyph: "size-11 p-0 [&_svg]:size-4",
        pill: "min-h-[46px] min-w-11 gap-2 px-[13px] rounded-[16px] border-4 bg-clip-padding text-[14px]/none font-semibold [&_svg]:size-5",
      },
    },
    compoundVariants: [
      { size: "pill", class: "border-transparent bg-accent text-accent-ink focus-inset" },
    ],
    defaultVariants: {
      variant: "default",
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
    name?: string;
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
    </button>
  );
});

export default Button;
