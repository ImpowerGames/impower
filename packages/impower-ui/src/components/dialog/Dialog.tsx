import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX, RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { useLayout } from "../../hooks/useLayout";
import { useMountTransition } from "../../hooks/useMountTransition";
import { holdSheetOpen } from "../../hooks/useSheetOpen";
import { cn } from "../../utils/cn";
import { focusReturnTarget } from "../../utils/focusReturn";
import { portalContainer } from "../../utils/portalContainer";
import { useToastLayer } from "../../utils/toastLayer";
import Button from "../button/Button";
import { CloseIcon } from "../icon/icons.generated";

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
        fill: "items-stretch",
      },
      visible: {
        true: "opacity-100 ease-[ease-out]",
        false: "opacity-0 ease-[ease-in]",
      },
    },
  },
);

const surface =
  "w-full select-none border border-edge bg-panel text-ink outline-none";

export const dialogVariants = cva(
  [
    surface,
    "max-h-full rounded-dialog",
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
        false: "overflow-y-auto overscroll-contain p-5",
      },
      visible: {
        true: "scale-none opacity-100 ease-[ease-out]",
        false: "scale-97 opacity-0 ease-[ease-in]",
      },
    },
    defaultVariants: { size: "sm", flush: false, visible: true },
  },
);

export const sheetVariants = cva(
  [
    surface,
    "overflow-y-auto overscroll-contain",
    "motion-safe:transition-transform motion-safe:duration-180",
  ],
  {
    variants: {
      size: {
        auto: "max-h-[80%] rounded-t-card border-b-0",
        full: "h-full max-h-none rounded-none border-0 pb-[env(safe-area-inset-bottom)]",
      },
      flush: {
        true: "flex flex-col overflow-hidden",
        false: "p-5",
      },
      visible: {
        true: "translate-none ease-[ease-out]",
        false: "translate-y-full ease-[ease-in]",
      },
    },
    defaultVariants: { size: "auto", flush: false, visible: true },
  },
);

export const lightboxVariants = cva(
  [
    "relative size-full select-none bg-stage text-ink outline-none",
    "motion-safe:transition-opacity motion-safe:duration-180",
  ],
  {
    variants: {
      visible: {
        true: "opacity-100 ease-[ease-out]",
        false: "opacity-0 ease-[ease-in]",
      },
    },
    defaultVariants: { visible: true },
  },
);

export type SheetSize = NonNullable<VariantProps<typeof sheetVariants>["size"]>;

export type DialogSize = NonNullable<
  VariantProps<typeof dialogVariants>["size"]
>;

type ModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dismissable?: boolean;
  flush?: boolean;
  initialFocus?: RefObject<HTMLElement>;
  returnFocus?: () => HTMLElement | null;
  onEscapeKeyDown?: (event: KeyboardEvent) => void;
  class?: string;
  children?: ComponentChildren;
};

export type SheetProps = ModalProps & { size?: SheetSize };

export type DialogProps = ModalProps & {
  size?: DialogSize;
  responsive?: boolean;
};

function Modal({
  open,
  onOpenChange,
  dismissable = true,
  initialFocus,
  returnFocus: returnTo,
  onEscapeKeyDown,
  placement,
  card,
  children,
}: Omit<ModalProps, "flush" | "class"> & {
  placement: "center" | "bottom" | "fill";
  card: (visible: boolean) => string;
}) {
  const { mounted, visible } = useMountTransition(open, DIALOG_TRANSITION_MS);
  useEffect(
    () => (open && placement === "bottom" ? holdSheetOpen() : undefined),
    [open, placement],
  );
  const content = useRef<HTMLDivElement | null>(null);
  const toastLayer = useToastLayer(open);
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
      <DialogPrimitive.Portal forceMount container={portalContainer()}>
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
              const target = returnTo?.() ?? returnFocus.current();
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
            <div ref={toastLayer} data-toast-layer class="contents" />
          </DialogPrimitive.Content>
        </DialogPrimitive.Overlay>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({ size, flush, class: className, ...rest }: SheetProps) {
  return (
    <Modal
      {...rest}
      placement="bottom"
      card={(visible) => cn(sheetVariants({ size, flush, visible }), className)}
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

export type LightboxProps = Omit<ModalProps, "flush" | "dismissable"> & {
  label: string;
  closeLabel?: string;
};

export function Lightbox({
  label,
  closeLabel = "Close",
  class: className,
  children,
  ...rest
}: LightboxProps) {
  const close = () => rest.onOpenChange(false);
  return (
    <Modal
      {...rest}
      placement="fill"
      card={(visible) => cn(lightboxVariants({ visible }), className)}
    >
      <DialogPrimitive.Title class="sr-only">{label}</DialogPrimitive.Title>
      <div
        class="absolute inset-0 flex items-center justify-center"
        data-lightbox-stage
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            close();
          }
        }}
      >
        {children}
      </div>
      <Button
        variant="quiet"
        size="icon"
        class="absolute top-3 right-3 rounded-full border-transparent bg-media-badge text-media-badge-ink [&_svg]:size-[18px]"
        aria-label={closeLabel}
        title={closeLabel}
        data-lightbox-close
        onClick={close}
      >
        <CloseIcon />
      </Button>
    </Modal>
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
