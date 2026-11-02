import { Button, X } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { createPortal } from "preact/compat";
import { useEffect, useState } from "preact/hooks";
import { useMountTransition } from "../../hooks/useMountTransition";
import { dismissSnackbar, snackbar, type Snackbar } from "../../utils/snackbar";

export default function SnackbarHost() {
  const current = useComputed(() => snackbar.value).value;
  const [shown, setShown] = useState<Snackbar | null>(current);
  useEffect(() => {
    if (current) {
      setShown(current);
    }
  }, [current]);
  const { mounted, visible } = useMountTransition(!!current, 200);

  if (!mounted || !shown || typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      class="pointer-events-none fixed inset-x-0 bottom-32 z-[60] flex justify-center px-4"
      role="status"
      aria-live="assertive"
    >
      <div
        class={`pointer-events-auto flex max-w-[calc(100vw-2rem)] flex-row items-center gap-3 rounded-lg bg-popup px-4 py-3 text-sm text-foreground shadow-2xl ring-1 ring-foreground/10 transition-all duration-200 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
        }`}
      >
        <span class={`min-w-0 flex-1 ${shown.persistent ? "" : "truncate"}`}>
          {shown.message}
        </span>
        {shown.actionLabel && (
          <Button
            variant="ghost"
            onClick={() => {
              shown.onAction?.();
              if (!shown.persistent) {
                dismissSnackbar(shown);
              }
            }}
            class="h-7 flex-none rounded px-2 text-sm font-medium text-primary hover:bg-primary/10"
          >
            {shown.actionLabel}
          </Button>
        )}
        {shown.persistent && (
          <Button
            variant="ghost"
            aria-label="Dismiss"
            onClick={() => dismissSnackbar(shown)}
            class="size-7 flex-none rounded-full p-0 text-foreground/60 hover:bg-foreground/10 hover:text-foreground"
          >
            <X class="size-4" />
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}
