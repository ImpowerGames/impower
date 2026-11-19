import { useCallback, useRef } from "preact/hooks";
import type { OutlineRow } from "./outlineRows";

type Place = {
  uri: string;
  top: number;
  focus: { key: string; control: number } | null;
  current: number;
  request: number;
  shownRequest: number;
};

const FOCUSABLE = "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])";

let kept: Place | null = null;

const placeOf = (uri: string, current: number): Place => {
  if (kept?.uri !== uri) {
    kept = { uri, top: 0, focus: null, current, request: 1, shownRequest: 0 };
  } else if (kept.current !== current) {
    kept.current = current;
    kept.request += 1;
  }
  return kept;
};

const shown = (element: HTMLElement) => element.isConnected && element.clientHeight > 0;

const controlsOf = (slot: Element) => [...slot.querySelectorAll<HTMLElement>(FOCUSABLE)];

const nothingFocused = () => !document.activeElement || document.activeElement === document.body;

export default function useRailPlace(uri: string, rows: readonly OutlineRow[], current: number) {
  const place = placeOf(uri, current);
  const latest = useRef({ place, rows });
  latest.current = { place, rows };
  const detach = useRef<(() => void) | null>(null);

  const listRef = useCallback((element: HTMLDivElement | null) => {
    detach.current?.();
    detach.current = null;
    if (!element) {
      return;
    }
    let visible = false;

    const restoreFocus = () => {
      const { place, rows } = latest.current;
      const focus = place.focus;
      if (!focus || !nothingFocused() || !shown(element)) {
        return;
      }
      const index = rows.findIndex((row) => row.key === focus.key);
      const slot = index < 0 ? null : element.querySelector(`[role="listitem"][aria-posinset="${index + 1}"]`);
      const control = slot ? controlsOf(slot)[focus.control] : undefined;
      control?.focus({ preventScroll: true });
    };

    const appear = () => {
      visible = true;
      element.scrollTop = latest.current.place.top;
      requestAnimationFrame(restoreFocus);
    };

    const disappear = () => {
      visible = false;
      const { place } = latest.current;
      place.shownRequest = place.request;
    };

    const onScroll = () => {
      if (shown(element)) {
        latest.current.place.top = element.scrollTop;
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const slot = target?.closest('[role="listitem"]');
      const row = slot ? latest.current.rows[Number(slot.getAttribute("aria-posinset")) - 1] : undefined;
      latest.current.place.focus = slot && row ? { key: row.key, control: controlsOf(slot).indexOf(target!) } : null;
    };

    const onFocusOut = (event: FocusEvent) => {
      const next = event.relatedTarget;
      if (next instanceof Node && element.contains(next)) {
        return;
      }
      if (shown(element)) {
        latest.current.place.focus = null;
      }
    };

    const observer = new ResizeObserver(() => {
      if (shown(element) === visible) {
        return;
      }
      if (visible) {
        disappear();
      } else {
        appear();
      }
    });

    element.addEventListener("scroll", onScroll, { passive: true });
    element.addEventListener("focusin", onFocusIn);
    element.addEventListener("focusout", onFocusOut);
    observer.observe(element);
    detach.current = () => {
      if (visible) {
        disappear();
      }
      observer.disconnect();
      element.removeEventListener("scroll", onScroll);
      element.removeEventListener("focusin", onFocusIn);
      element.removeEventListener("focusout", onFocusOut);
    };
  }, []);

  return {
    listRef,
    revealIndex: place.request === place.shownRequest ? undefined : current,
    revealRequest: place.request,
  };
}
