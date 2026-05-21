import { Button } from "@impower/impower-ui/components";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";

const optionButtonSize = cva("", {
  variants: {
    size: {
      default: "h-14 px-8 text-base",
      sm: "h-12 px-6 text-sm",
    },
  },
  defaultVariants: { size: "default" },
});

export type OptionButtonProps = Omit<
  JSX.HTMLAttributes<HTMLButtonElement>,
  "size" | "type"
> &
  VariantProps<typeof optionButtonSize> & {
    /** Tailwind classes appended after the base layout. */
    class?: string;
    children?: ComponentChildren;
  };

/**
 * List-row button for the share/assets/logic panes. Full-width, fixed
 * height (56px default), left-aligned leading content + right-aligned
 * trailing content via children's flex layout.
 *
 * Wraps the impower-ui `<Button variant="ghost">` so it inherits the
 * standard ripple + hover/active overlays automatically. The size
 * variant adds the row-specific height + padding on top.
 */
export default function OptionButton({
  size,
  class: className = "",
  children,
  ...rest
}: OptionButtonProps) {
  return (
    <Button
      variant="ghost"
      class={`w-full justify-between rounded-none text-foreground/80 ${optionButtonSize({ size })} ${className}`}
      {...rest}
    >
      {children}
    </Button>
  );
}
