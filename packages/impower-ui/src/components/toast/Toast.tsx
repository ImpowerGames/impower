import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { useMountTransition } from "../../hooks/useMountTransition";
import { cn } from "../../utils/cn";
import { topToastLayer } from "../../utils/toastLayer";
import Button from "../button/Button";

export const TOAST_TRANSITION_MS = 150;
export const TOAST_SWIPE_DISMISS_PX = 24;

export const toastVariants = cva(
  [
    "pointer-events-auto flex max-w-[calc(var(--toast-width,100vw)-var(--toast-inset))] min-h-11 touch-none flex-row items-center gap-2",
    "rounded-toast bg-ink py-0 pl-4 pr-1 text-[12px]/[1.5] text-bg shadow-float",
  ],
  {
    variants: {
      visible: {
        true: "motion-safe:anim-toast-in",
        false: "motion-safe:anim-toast-out motion-reduce:invisible",
      },
    },
    defaultVariants: { visible: true },
  },
);

export type ToastVisible = NonNullable<VariantProps<typeof toastVariants>["visible"]>;

export type ToastProps = {
  open: boolean;
  message: ComponentChildren;
  actionLabel?: string;
  onAction?: () => void;
  onDismiss: () => void;
  wrap?: boolean;
  class?: string;
};

export default function Toast({
  open,
  message,
  actionLabel,
  onAction,
  onDismiss,
  wrap = false,
  class: className,
}: ToastProps) {
  const { mounted } = useMountTransition(open, TOAST_TRANSITION_MS);
  const swipeStart = useRef<number | null>(null);
  const [lift, setLift] = useState(0);

  useEffect(() => {
    if (!open) {
      swipeStart.current = null;
      setLift(0);
    }
  }, [open]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }

  const endSwipe = () => {
    if (swipeStart.current === null) {
      return;
    }
    swipeStart.current = null;
    if (open && Math.abs(lift) >= TOAST_SWIPE_DISMISS_PX) {
      onDismiss();
    } else {
      setLift(0);
    }
  };

  return createPortal(
    <div
      class="pointer-events-none fixed top-[var(--toast-top)] bottom-[var(--toast-bottom)] left-[var(--toast-left,0px)] z-[60] flex h-[var(--toast-height)] w-[var(--toast-width,100vw)] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div
        data-toast
        inert={!open}
        class={cn(toastVariants({ visible: open }), className)}
        style={lift ? { translate: `0 ${lift}px` } : undefined}
        onPointerDown={(event) => {
          if (event.pointerType === "mouse") {
            return;
          }
          swipeStart.current = event.clientY;
        }}
        onPointerMove={(event) => {
          if (swipeStart.current !== null) {
            setLift(event.clientY - swipeStart.current);
          }
        }}
        onPointerUp={endSwipe}
        onPointerCancel={endSwipe}
      >
        <span class={cn("min-w-0 flex-auto py-2", wrap ? "" : "fade-edge pr-[var(--fade)]")}>{message}</span>
        {actionLabel && (
          <Button
            variant="quiet"
            class="font-semibold text-bg"
            onClick={() => {
              if (open) {
                onAction?.();
              }
            }}
          >
            {actionLabel}
          </Button>
        )}
      </div>
    </div>,
    topToastLayer() ?? document.body,
  );
}
