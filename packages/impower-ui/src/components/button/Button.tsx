import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";

// Variant configuration in cva form. The defaultVariants set the
// no-variant-prop case to `primary` + `default`.
export const buttonVariants = cva(
  // BASE — applied to every variant.
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium select-none",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-background hover:bg-primary-500 active:bg-primary-600",
        secondary:
          "bg-engine-700 text-foreground hover:bg-engine-600 active:bg-engine-800",
        outline:
          "border border-foreground/20 bg-transparent text-foreground hover:bg-foreground/5 active:bg-foreground/10",
        ghost:
          "bg-transparent text-foreground hover:bg-foreground/10 active:bg-foreground/15",
        link: "bg-transparent text-primary underline-offset-4 hover:underline h-auto px-0 py-0",
        destructive:
          "bg-danger-500 text-foreground hover:bg-danger-600 active:bg-danger-700",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-sm",
        xs: "h-7 rounded px-2 text-xs",
        lg: "h-11 rounded-md px-8",
        icon: "size-10 p-0",
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
    /**
     * Render the styles on the immediate child element instead of a
     * `<button>`. Use to wrap a Radix Trigger, an `<a>`, or any custom-
     * element button. Built on Radix Slot — copies className and merges
     * accessibility props onto the child.
     */
    asChild?: boolean;
    /** Tailwind classes appended after the variant + size classes. */
    class?: string;
    /** HTML `type` for `<button>`. Defaults to `"button"` so the button
     *  doesn't accidentally submit ancestor forms. Ignored when `asChild`
     *  is true (the child element controls its own semantics). */
    type?: "button" | "submit" | "reset";
    children?: ComponentChildren;
  };

/**
 * Headless button. Tailwind styling via cva + Radix Slot for composition.
 * Standard primitive for buttons across impower-ui.
 *
 * @example
 * <Button onClick={save}>Save</Button>
 * <Button variant="outline" size="sm">Cancel</Button>
 * <Button variant="ghost" size="icon" aria-label="Close"><Close /></Button>
 * <Button asChild><a href="/docs">Docs</a></Button>
 */
export default function Button({
  variant,
  size,
  asChild,
  class: className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const Comp: any = asChild ? Slot : "button";
  const extraProps = asChild ? {} : { type };
  return (
    <Comp
      class={cn(buttonVariants({ variant, size }), className)}
      {...extraProps}
      {...rest}
    >
      {children}
    </Comp>
  );
}
