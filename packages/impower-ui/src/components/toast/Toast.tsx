import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useRef, useState } from "preact/hooks";
import { useCoarsePointer } from "../../hooks/useCoarsePointer";
import { useMountTransition } from "../../hooks/useMountTransition";
import { cn } from "../../utils/cn";
import { topToastLayer } from "../../utils/toastLayer";
import Button from "../button/Button";
import {
  CloseIcon,
} from "../icon/icons.generated";

export const TOAST_TRANSITION_MS = 150;
export const TOAST_SWIPE_DISMISS_PX = 24;

export const toastVariants = cva(
  [
    "pointer-events-auto flex max-w-[calc(100vw-28px)] min-h-11 touch-none flex-row items-center gap-3",
    "rounded-toast border border-edge bg-elevated py-1 pl-4 pr-1 text-[14px]/[1.5] text-ink shadow-float",
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
  const coarse = useCoarsePointer();
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
    if (open && lift <= -TOAST_SWIPE_DISMISS_PX) {
      onDismiss();
    } else {
      setLift(0);
    }
  };

  return createPortal(
    <div
      class="pointer-events-none fixed inset-x-0 top-[var(--toast-top)] z-[60] flex justify-center px-3.5"
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
            setLift(Math.min(0, event.clientY - swipeStart.current));
          }
        }}
        onPointerUp={endSwipe}
        onPointerCancel={endSwipe}
      >
        <span class={cn("min-w-0 flex-auto py-2", wrap ? "" : "fade-edge pr-[var(--fade)]")}>{message}</span>
        {actionLabel && (
          <Button
            variant="quiet"
            class="text-accent"
            onClick={() => {
              if (open) {
                onAction?.();
              }
            }}
          >
            {actionLabel}
          </Button>
        )}
        {!coarse && (
          <Button
            variant="quiet"
            size="icon"
            aria-label="Dismiss"
            onClick={() => {
              if (open) {
                onDismiss();
              }
            }}
          >
            <CloseIcon />
          </Button>
        )}
      </div>
    </div>,
    topToastLayer() ?? document.body,
  );
}
