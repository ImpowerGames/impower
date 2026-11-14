import * as DialogPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX, RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";
import { useLayout } from "../../hooks/useLayout";
import { useMountTransition } from "../../hooks/useMountTransition";
import { holdSheetOpen } from "../../hooks/useSheetOpen";
import { cn } from "../../utils/cn";
import "../../utils/uniqueIds";
import { focusReturnTarget } from "../../utils/focusReturn";
import { type KeepClear, keepsClear, useClearLine } from "../../utils/keepClear";
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
      fit: {
        free: "",
        room: "top-[var(--keep-clear-top)]",
      },
    },
    defaultVariants: { fit: "free" },
  },
);

const SHEET_ROW = '[role^="menuitem"], [role="option"]';

const leastSheet = (card: HTMLElement | null) => {
  if (!card) {
    return 0;
  }
  const row = card.querySelector(SHEET_ROW);
  if (!row) {
    return card.scrollHeight;
  }
  let foot = 0;
  let scrolled = 0;
  for (let at = row.parentElement; at; at = at === card ? null : at.parentElement) {
    const style = getComputedStyle(at);
    foot += (parseFloat(style.paddingBottom) || 0) + (parseFloat(style.borderBottomWidth) || 0);
    scrolled += at.scrollTop;
  }
  return row.getBoundingClientRect().bottom + scrolled - card.getBoundingClientRect().top + foot;
};

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
        form: "max-w-[440px]",
      },
      flush: {
        true: "flex flex-col overflow-hidden",
        false: "overflow-y-auto overscroll-contain",
      },
      visible: {
        true: "scale-none opacity-100 ease-[ease-out]",
        false: "scale-97 opacity-0 ease-[ease-in]",
      },
    },
    compoundVariants: [
      { size: ["sm", "md", "lg"], flush: false, class: "p-5" },
      { size: "form", flush: false, class: "p-[26px] phone:p-[19px]" },
    ],
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
        auto: "rounded-t-card border-b-0",
        full: "h-full max-h-none rounded-none border-0 pb-[env(safe-area-inset-bottom)]",
      },
      fit: {
        free: "",
        room: "",
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
    compoundVariants: [
      { size: "auto", fit: "free", class: "max-h-[80%]" },
      { size: "auto", fit: "room", class: "max-h-full" },
    ],
    defaultVariants: { size: "auto", fit: "free", flush: false, visible: true },
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
  onCloseAutoFocus?: (event: Event) => void;
  class?: string;
  children?: ComponentChildren;
};

export type SheetProps = ModalProps & { size?: SheetSize; keepClear?: KeepClear };

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
  onCloseAutoFocus,
  keepClear,
  placement,
  card,
  children,
}: Omit<ModalProps, "flush" | "class"> & {
  keepClear?: KeepClear;
  placement: "center" | "bottom" | "fill";
  card: (visible: boolean, fit: "free" | "room") => string;
}) {
  const { mounted, visible } = useMountTransition(open, DIALOG_TRANSITION_MS);
  const kept = !!keepClear && placement === "bottom";
  useEffect(
    () => (open && placement === "bottom" ? holdSheetOpen() : undefined),
    [open, placement],
  );
  const content = useRef<HTMLDivElement | null>(null);
  const top = useClearLine(
    kept ? keepClear : undefined,
    open,
    (line) => Math.max(0, Math.min(line, window.innerHeight - leastSheet(content.current))),
    content,
  );
  const fit = top === undefined ? "free" : "room";
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
  const refuseOutside = (event: Event) => {
    if (keepsClear(kept ? keepClear : undefined, event.target)) {
      event.preventDefault();
    }
    refuse(event);
  };

  const backdropClass = backdropVariants({ placement, visible, fit });
  const backdrop = (inner: ComponentChildren) =>
    kept ? (
      <div
        class={backdropClass}
        style={top === undefined ? undefined : { "--keep-clear-top": `${top}px` }}
        data-keep-clear-backdrop
      >
        {inner}
      </div>
    ) : (
      <DialogPrimitive.Overlay forceMount class={backdropClass}>
        {inner}
      </DialogPrimitive.Overlay>
    );

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange} modal={!kept}>
      <DialogPrimitive.Portal forceMount container={portalContainer()}>
        {backdrop(
          <DialogPrimitive.Content
            ref={content}
            forceMount
            aria-modal={kept ? "false" : "true"}
            class={card(visible, fit)}
            onOpenAutoFocus={(event: Event) => {
              const target = initialFocus?.current;
              if (target) {
                event.preventDefault();
                target.focus();
              }
            }}
            onCloseAutoFocus={(event: Event) => {
              onCloseAutoFocus?.(event);
              if (event.defaultPrevented) {
                return;
              }
              event.preventDefault();
              const active = document.activeElement;
              if (kept && active && active !== document.body && !content.current?.contains(active)) {
                return;
              }
              const target = returnTo?.() ?? returnFocus.current();
              if (target?.isConnected) {
                target.focus();
              }
            }}
            onEscapeKeyDown={(event: KeyboardEvent) => {
              onEscapeKeyDown?.(event);
              refuse(event);
            }}
            onPointerDownOutside={refuseOutside}
            onInteractOutside={refuseOutside}
          >
            {children}
            <div ref={toastLayer} data-toast-layer class="contents" />
          </DialogPrimitive.Content>,
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Sheet({ size, flush, class: className, ...rest }: SheetProps) {
  return (
    <Modal
      {...rest}
      placement="bottom"
      card={(visible, fit) => cn(sheetVariants({ size, flush, visible, fit }), className)}
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
        class="absolute top-3 right-3 rounded-full border-transparent bg-media-button text-media-badge-ink [&_svg]:size-[18px]"
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
