import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX, RefObject } from "preact";
import { useRef } from "preact/hooks";
import { useLayout } from "../../hooks/useLayout";
import { useMountTransition } from "../../hooks/useMountTransition";
import { cn } from "../../utils/cn";
import { focusReturnTarget } from "../../utils/focusReturn";

export const DIALOG_TRANSITION_MS = 180;

const backdropVariants = cva(
  [
    "fixed inset-0 z-50 flex bg-scrim",
    "motion-safe:transition-opacity motion-safe:duration-180",
  ],
  {
    variants: {
      placement: {
        center: "items-center justify-center p-4",
        bottom: "flex-col justify-end",
      },
      visible: {
        true: "opacity-100 ease-[ease-out]",
        false: "opacity-0 ease-[ease-in]",
      },
    },
  },
);

const surface =
  "w-full select-none bg-elevated text-ink shadow-2xl ring-1 ring-ink/10 outline-none";

export const dialogVariants = cva(
  [
    surface,
    "rounded-lg",
    "motion-safe:transition-[opacity,scale] motion-safe:duration-180",
  ],
  {
    variants: {
      size: {
        sm: "max-w-sm",
        md: "max-w-md",
        lg: "max-w-lg",
      },
      flush: {
        true: "flex flex-col overflow-hidden",
        false: "p-5",
      },
      visible: {
        true: "scale-100 opacity-100 ease-[ease-out]",
        false: "scale-97 opacity-0 ease-[ease-in]",
      },
    },
    defaultVariants: { size: "sm", flush: false, visible: true },
  },
);

export const sheetVariants = cva(
  [
    surface,
    "max-h-[80vh] overflow-y-auto rounded-t-lg",
    "motion-safe:transition-transform motion-safe:duration-180",
  ],
  {
    variants: {
      flush: {
        true: "flex flex-col overflow-hidden",
        false: "p-5",
      },
      visible: {
        true: "translate-y-0 ease-[ease-out]",
        false: "translate-y-full ease-[ease-in]",
      },
    },
    defaultVariants: { flush: false, visible: true },
  },
);

export type DialogSize = NonNullable<
  VariantProps<typeof dialogVariants>["size"]
>;

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissable?: boolean;
  flush?: boolean;
  initialFocus?: RefObject<HTMLElement>;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  class?: string;
  children?: ComponentChildren;
};

export type SheetProps = ModalProps;

export type DialogProps = ModalProps & {
  size?: DialogSize;
  responsive?: boolean;
};

function Modal({
  open,
  onOpenChange,
  dismissable = true,
  initialFocus,
  onEscapeKeyDown,
  placement,
  card,
  children,
}: Omit<ModalProps, "flush" | "class"> & {
  placement: "center" | "bottom";
  card: (visible: boolean) => string;
}) {
  const { mounted, visible } = useMountTransition(open, DIALOG_TRANSITION_MS);
  const content = useRef<HTMLDivElement | null>(null);
  const returnFocus = useRef<() => HTMLElement | null>(() => null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const active = document.activeElement;
    if (!content.current?.contains(active)) {
      returnFocus.current = focusReturnTarget(active);
    }
  }
  wasOpen.current = open;

  if (!mounted) {
    return null;
  }

  const refuse = (event: Event) => {
    if (!dismissable) {
      event.preventDefault();
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal forceMount>
        <DialogPrimitive.Overlay
          forceMount
          class={backdropVariants({ placement, visible })}
        >
          <DialogPrimitive.Content
            ref={content}
            forceMount
            aria-modal="true"
            class={card(visible)}
            onOpenAutoFocus={(event: Event) => {
              const target = initialFocus?.current;
              if (target) {
                event.preventDefault();
                target.focus();
              }
            }}
            onCloseAutoFocus={(event: Event) => {
              event.preventDefault();
              const target = returnFocus.current();
              if (target?.isConnected) {
                target.focus();
              }
            }}
            onEscapeKeyDown={(event: KeyboardEvent) => {
              onEscapeKeyDown?.(event);
              refuse(event);
            }}
            onPointerDownOutside={refuse}
            onInteractOutside={refuse}
          >
            {children}
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({ flush, class: className, ...rest }: SheetProps) {
  return (
    <Modal
      {...rest}
      placement="bottom"
      card={(visible) => cn(sheetVariants({ flush, visible }), className)}
    />
  );
}

export function Dialog({
  size,
  responsive = false,
  flush,
  class: className,
  ...rest
}: DialogProps) {
  const sheet = useLayout() === "phone" && responsive;
  return (
    <Modal
      {...rest}
      placement={sheet ? "bottom" : "center"}
      card={(visible) =>
        cn(
          sheet
            ? sheetVariants({ flush, visible })
            : dialogVariants({ size, flush, visible }),
          className,
        )
      }
    />
  );
}

export function DialogTitle({
  class: className,
  ...rest
}: Omit<JSX.HTMLAttributes<HTMLHeadingElement>, "class"> & { class?: string }) {
  return (
    <DialogPrimitive.Title
      class={cn("text-base font-semibold", className)}
      {...rest}
    />
  );
}

export function DialogDescription({
  class: className,
  ...rest
}: Omit<JSX.HTMLAttributes<HTMLParagraphElement>, "class"> & {
  class?: string;
}) {
  return (
    <DialogPrimitive.Description
      class={cn("text-sm text-ink/70", className)}
      {...rest}
    />
  );
}

export function DialogActions({
  class: className,
  ...rest
}: Omit<JSX.HTMLAttributes<HTMLDivElement>, "class"> & { class?: string }) {
  return (
    <div class={cn("flex flex-row justify-end gap-2", className)} {...rest} />
  );
}

export default Dialog;
