import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX, Ref } from "preact";
import { forwardRef } from "preact/compat";
import { cn } from "../../utils/cn";
import Ripple from "../ripple/Ripple";

// Sparkle's filled s-button elevation: rest = shadow-box-1, hover lifts to
// box-2, active depresses to box-0 (none). Values are the dark-theme resolved
// composites (key + ambient) from sparkle shadows.css. Applied to the solid
// fill variants (primary/secondary/destructive/fab) only.
const FILLED_SHADOW =
  "shadow-[0_1px_1.5px_hsl(0_0%_0%/0.24),0_1px_1px_hsl(0_0%_0%/0.48)] " +
  "hover:shadow-[0_3px_3px_hsl(0_0%_0%/0.32),0_3px_3px_hsl(0_0%_0%/0.46)] " +
  "active:shadow-none";

// Variant configuration in cva form. The defaultVariants set the
// no-variant-prop case to `primary` + `default`.
export const buttonVariants = cva(
  // BASE — applied to every variant. cursor-pointer is explicit because
  // Tailwind v4 dropped the `cursor: pointer` from the <button> preflight.
  // pointer-events-auto re-asserts hit-testing — sparkle's normalize.css
  // sets `* { pointer-events: none }` defensively, and without an
  // explicit opt-in our buttons would be visually clickable but cursor
  // wouldn't follow on hover (cursor tracks the topmost hit-testable
  // element, which fell through to the parent).
  [
    // `relative` so the inner <Ripple /> can position its waves
    // absolutely against the button. The ripple component's own
    // container span carries `overflow-hidden` (with border-radius:
    // inherit), so the waves get clipped to the button's shape WITHOUT
    // the button itself needing overflow:hidden — that turned out to
    // hijack wheel events in some browsers, breaking parent scroll.
    "relative",
    // `flex-row` is explicit because sparkle's normalize.css ships
    // `* { flex-flow: column }` as a defensive base. Without re-asserting
    // it here, every Button's content stacks vertically instead of
    // sitting on a single row.
    "inline-flex flex-row items-center justify-center gap-2 whitespace-nowrap",
    "rounded-md text-sm font-medium select-none cursor-pointer pointer-events-auto",
    // 100ms (matches main's button.css --_duration) + box-shadow so the
    // filled-variant elevation lift animates.
    "transition-[color,background-color,border-color,box-shadow] duration-100",
    // Keyboard focus ring matches main: a 3px solid INSET outline in the dark
    // focus color (sparkle --theme-color-primary-20 = sky-900 #0c4a6e), not a
    // bright outset ring. outline-none suppresses the UA outline on mouse focus
    // (focus-visible is keyboard-only, like main's shouldShowStrongFocus).
    "outline-none focus-visible:[outline:3px_solid_#0c4a6e] focus-visible:[outline-offset:-3px]",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      variant: {
        // Static hover/active overlays match sparkle's universal
        // --theme-opacity-hover (0.05) and --theme-opacity-press (0.12).
        // For solid-fill variants the overlay is a `before:` pseudo so
        // the underlying bg color stays intact (don't mix-replace it).
        primary:
          `bg-primary text-background before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12] ${FILLED_SHADOW}`,
        secondary:
          `bg-engine-700 text-foreground before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12] ${FILLED_SHADOW}`,
        // `border-solid` re-asserts the border-style — sparkle's normalize.css
        // ships `* { border: none }` which leaks into shadow:false light-DOM
        // and zeros out border-width if we only set color via Tailwind. Same
        // story for `bg-transparent` + Tailwind utilities being undone by the
        // normalize reset; sticking with explicit `border-solid border-1` is
        // the workaround.
        outline:
          "border-solid border border-foreground bg-transparent text-foreground hover:bg-foreground/5 active:bg-foreground/[0.12]",
        ghost:
          "bg-transparent text-foreground hover:bg-foreground/5 active:bg-foreground/[0.12]",
        link: "bg-transparent text-primary underline-offset-4 hover:underline h-auto px-0 py-0",
        destructive:
          `bg-danger-500 text-foreground before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12] ${FILLED_SHADOW}`,
        // Floating-action button: the slate-blue rounded-full CTA used
        // by Upload Files / Add URL / New Script. The legacy `fab-bg`/
        // `fab-fg` theme tokens are exactly `engine-700` (the editor's
        // slate-blue) on always-white text — same as `secondary` but
        // forced white text rather than theme `foreground`.
        fab: `bg-engine-700 text-white before:absolute before:inset-0 before:bg-current before:opacity-0 hover:before:opacity-[0.05] active:before:opacity-[0.12] ${FILLED_SHADOW}`,
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3 text-sm",
        xs: "h-7 rounded px-2 text-xs",
        // Matches main's sparkle `size="lg"` computed box exactly: height
        // 48px (h-12), corner 4px (rounded, not rounded-md's 6px), padding-
        // inline 20px (px-5), and font-size 16px (text-base = --theme-text-md-
        // font-size; the cva base is text-sm/14px otherwise).
        lg: "h-12 rounded px-5 text-base",
        icon: "size-10 p-0",
        // Larger circular icon button for toolbars (48px). Matches
        // sparkle's <s-button variant="icon" width="48" height="48">.
        "icon-lg": "size-12 rounded-full p-0",
        // Full-width FAB button — used for Upload Files / Add URL /
        // New Script (48px tall, pill-shaped, fills horizontal space).
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
    /** Disable the button. preact's generic HTMLAttributes doesn't include
     *  `disabled`, so it's declared explicitly here; it's forwarded to the
     *  underlying `<button>` (or slotted element) via `...rest`. */
    disabled?: boolean;
    children?: ComponentChildren;
  };

/**
 * Headless button. Tailwind styling via cva + Radix Slot for composition.
 * Standard primitive for buttons across impower-ui.
 *
 * Uses `forwardRef` so refs propagate to the inner `<button>` (or slotted
 * element under `asChild`). This is what makes `<RadixTrigger asChild>
 * <Button /></RadixTrigger>` work — Radix needs the ref to position
 * popups + manage focus.
 *
 * @example
 * <Button onClick={save}>Save</Button>
 * <Button variant="outline" size="sm">Cancel</Button>
 * <Button variant="ghost" size="icon" aria-label="Close"><Close /></Button>
 * <Button asChild><a href="/docs">Docs</a></Button>
 */
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
      {/* Material-style ripple. Skipped under `asChild` because Slot
          merges its single child onto the slotted element; adding a
          second child here would break that contract. asChild consumers
          can drop their own <Ripple /> inside the slotted element. */}
      {!asChild && <Ripple />}
    </Comp>
  );
});

export default Button;
