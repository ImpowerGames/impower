import * as PopoverPrimitive from "@radix-ui/react-popover";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";

export const popoverVariants = cva(
  [
    "z-50 flex flex-col text-ink outline-none",
    "max-h-[var(--radix-popover-content-available-height)]",
    "origin-[--radix-popover-content-transform-origin]",
    "motion-safe:data-[state=open]:anim-menu-in motion-safe:data-[state=closed]:anim-menu-out",
  ],
  {
    variants: {
      size: {
        auto: "",
        panel: "w-[360px] max-w-[calc(100vw-24px)]",
      },
      frame: {
        card: "overflow-hidden rounded-card border border-edge bg-panel shadow-float",
        none: "",
      },
    },
    defaultVariants: { size: "auto", frame: "card" },
  },
);

export type PopoverVariantProps = VariantProps<typeof popoverVariants>;

export type PopoverProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: ComponentChildren;
};

export function Popover(props: PopoverProps) {
  return <PopoverPrimitive.Root {...props} />;
}

export function PopoverTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children?: ComponentChildren;
}) {
  return (
    <PopoverPrimitive.Trigger asChild={asChild}>{children}</PopoverPrimitive.Trigger>
  );
}

export function PopoverAnchor({
  asChild,
  children,
}: {
  asChild?: boolean;
  children?: ComponentChildren;
}) {
  return (
    <PopoverPrimitive.Anchor asChild={asChild}>{children}</PopoverPrimitive.Anchor>
  );
}

export type PopoverContentProps = PopoverVariantProps & {
  class?: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  sideOffset?: number;
  alignOffset?: number;
  collisionPadding?: number;
  onOpenAutoFocus?: (event: Event) => void;
  onCloseAutoFocus?: (event: Event) => void;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  onInteractOutside?: (event: Event) => void;
  onPointerDownOutside?: (event: Event) => void;
  onFocusOutside?: (event: Event) => void;
  children?: ComponentChildren;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "size">;

export function PopoverContent({
  class: className,
  size,
  frame,
  sideOffset = 8,
  collisionPadding = 12,
  children,
  ...rest
}: PopoverContentProps) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        class={cn(popoverVariants({ size, frame }), className)}
        {...rest}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export default Popover;
