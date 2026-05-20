import { Slot } from "@radix-ui/react-slot";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "link"
  | "destructive";

export type ButtonSize = "default" | "sm" | "lg" | "icon" | "xs";

export type ButtonProps = Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "size" | "type"
> & {
  /** Visual style. Default `primary`. */
  variant?: ButtonVariant;
  /** Sizing preset. Default `default` (h-10). */
  size?: ButtonSize;
  /**
   * Render the styles on the immediate child element instead of a `<button>`.
   * Use to wrap a Radix Trigger, an `<a>`, or any custom-element button.
   * Built on Radix's Slot — copies className and forwards refs.
   */
  asChild?: boolean;
  /** Tailwind classes appended after the variant + size classes. */
  class?: string;
  /** HTML `type` for `<button>`. Defaults to `"button"` so the button doesn't
   *  accidentally submit ancestor forms. Ignored when `asChild` is true. */
  type?: "button" | "submit" | "reset";
  children?: ComponentChildren;
};

// Common styles applied to every variant. Compositor-friendly transitions
// (color + bg) so they survive a busy main thread, same approach as Tabs.
const BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap " +
  "rounded-md text-sm font-medium select-none " +
  "transition-colors duration-150 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary " +
  "focus-visible:ring-offset-2 focus-visible:ring-offset-background " +
  "disabled:pointer-events-none disabled:opacity-50";

// Variants map to the impower-ui token palette. `primary`/`secondary`
// translate to the brand colors; `outline`/`ghost` are quiet alternatives;
// `destructive` uses the danger scale (defined in style.css alongside
// engine/primary/success/warning). `link` is a text-only call-to-action.
const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-primary text-background hover:bg-primary-500 active:bg-primary-600",
  secondary:
    "bg-engine-700 text-foreground hover:bg-engine-600 active:bg-engine-800",
  outline:
    "border border-foreground/20 bg-transparent text-foreground " +
    "hover:bg-foreground/5 active:bg-foreground/10",
  ghost:
    "bg-transparent text-foreground hover:bg-foreground/10 active:bg-foreground/15",
  link:
    "bg-transparent text-primary underline-offset-4 hover:underline " +
    "h-auto px-0 py-0",
  destructive:
    "bg-danger-500 text-foreground hover:bg-danger-600 active:bg-danger-700",
};

const SIZES: Record<ButtonSize, string> = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3 text-sm",
  xs: "h-7 rounded px-2 text-xs",
  lg: "h-11 rounded-md px-8",
  icon: "size-10 p-0",
};

/**
 * Headless button. Tailwind styling + Radix Slot for composition. The
 * standard primitive for buttons across impower-ui — use directly in Preact
 * JSX or via the `<s-button>`-replacement custom-element wrapper.
 *
 * @example
 * <Button onClick={save}>Save</Button>
 * <Button variant="outline" size="sm">Cancel</Button>
 * <Button variant="ghost" size="icon" aria-label="Close"><Close /></Button>
 * <Button asChild><a href="/docs">Docs</a></Button>
 */
export default function Button({
  variant = "primary",
  size = "default",
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
      class={cn(BASE, VARIANTS[variant], SIZES[size], className)}
      {...extraProps}
      {...rest}
    >
      {children}
    </Comp>
  );
}
