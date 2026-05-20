import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";

// Class strings for the row-list button. cva makes it easy to grow this
// later (e.g. a `selected` variant once we wire the active editor row,
// or a `dense` size) without rewriting the call sites.
const optionButtonVariants = cva(
  [
    "relative flex w-full flex-row items-center justify-between",
    "text-foreground/80 select-none cursor-pointer",
    "transition-colors duration-150",
    "hover:bg-foreground/5 active:bg-foreground/10",
    "focus-visible:outline-none focus-visible:bg-foreground/5",
    "disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed",
  ],
  {
    variants: {
      size: {
        default: "h-14 px-8 text-base",
        sm: "h-12 px-6 text-sm",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export type OptionButtonProps = Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "size" | "type"
> &
  VariantProps<typeof optionButtonVariants> & {
    /** Tailwind classes appended after the base layout. */
    class?: string;
    children?: ComponentChildren;
  };

/**
 * List-row button for the share/assets/logic panes. Full-width, fixed
 * height (56px default), left-aligned leading content + right-aligned
 * trailing content via children's flex layout.
 *
 * Stays project-local because this row-style is impower-specific (file-list
 * rows / publish targets) — impower-ui's generic Button is the right
 * primitive for stand-alone CTAs.
 */
export default function OptionButton({
  size,
  class: className = "",
  children,
  ...rest
}: OptionButtonProps) {
  return (
    <button
      type="button"
      class={`${optionButtonVariants({ size })} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}
