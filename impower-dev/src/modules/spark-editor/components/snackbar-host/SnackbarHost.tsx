import { Toast, TOAST_TRANSITION_MS } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import { useEffect, useState } from "preact/hooks";
import { dismissSnackbar, snackbar, type Snackbar } from "../../utils/snackbar";

const PANE_SELECTOR = "[data-toast-pane]";

const usePaneAnchor = (active: boolean) => {
  useEffect(() => {
    if (!active) {
      return;
    }
    const root = document.documentElement;
    let observed: Element | null = null;
    const observer = new ResizeObserver(() => place());
    const place = () => {
      const pane = document.querySelector(PANE_SELECTOR);
      if (pane !== observed) {
        if (observed) {
          observer.unobserve(observed);
        }
        observed = pane;
        if (pane) {
          observer.observe(pane);
        }
      }
      const box = pane?.getBoundingClientRect();
      if (!box || box.width === 0) {
        root.style.removeProperty("--toast-left");
        root.style.removeProperty("--toast-width");
        return;
      }
      root.style.setProperty("--toast-left", `${box.left}px`);
      root.style.setProperty("--toast-width", `${box.width}px`);
    };
    place();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      observer.disconnect();
      root.style.removeProperty("--toast-left");
      root.style.removeProperty("--toast-width");
    };
  }, [active]);
};

export default function SnackbarHost() {
  const current = useComputed(() => snackbar.value).value;
  const [shown, setShown] = useState<Snackbar | null>(current);
  useEffect(() => {
    if (current) {
      setShown(current);
      return;
    }
    const left = setTimeout(() => setShown(null), TOAST_TRANSITION_MS);
    return () => clearTimeout(left);
  }, [current]);
  usePaneAnchor(!!shown);

  if (!shown) {
    return null;
  }

  return (
    <Toast
      open={!!current}
      message={shown.message}
      actionLabel={shown.actionLabel}
      onAction={() => {
        if (snackbar.value !== shown) {
          return;
        }
        shown.onAction?.();
        dismissSnackbar(shown);
      }}
      onDismiss={() => dismissSnackbar(shown)}
    />
  );
}
