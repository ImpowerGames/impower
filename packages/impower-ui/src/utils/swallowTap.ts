import { useEffect, useRef } from "preact/hooks";
import { touchPointer } from "../layout/menuForm";

const WITHHELD = [
  "pointerover",
  "pointerenter",
  "pointermove",
  "pointerup",
  "pointercancel",
  "pointerout",
  "pointerleave",
  "gotpointercapture",
  "lostpointercapture",
  "touchstart",
  "touchmove",
  "touchend",
  "touchcancel",
  "mouseover",
  "mouseenter",
  "mousemove",
  "mousedown",
  "mouseup",
  "mouseout",
  "mouseleave",
  "click",
  "dblclick",
  "auxclick",
  "contextmenu",
] as const;

const GESTURE_ENDS = new Set(["pointerup", "pointercancel", "touchend", "touchcancel"]);

const CANCELABLE = new Set(["mousedown", "mouseup", "click", "dblclick", "auxclick", "contextmenu"]);

const SETTLE_MS = 1000;

export const swallowTap = (pressing: PointerEvent) => {
  const ownerDocument = (pressing.target as Node | null)?.ownerDocument ?? document;
  pressing.preventDefault();
  let ended = 0;
  const withhold = (event: Event) => {
    if (!event.isTrusted) {
      return;
    }
    if (ended && event.timeStamp - ended > SETTLE_MS) {
      stop();
      return;
    }
    event.stopPropagation();
    if (CANCELABLE.has(event.type) && event.cancelable) {
      event.preventDefault();
    }
    if (GESTURE_ENDS.has(event.type)) {
      ended = event.timeStamp;
    }
    if (event.type === "click") {
      stop();
    }
  };
  const ends = (event: Event) => {
    if (event !== pressing) {
      stop();
    }
  };
  const stop = () => {
    for (const type of WITHHELD) {
      ownerDocument.removeEventListener(type, withhold, true);
    }
    ownerDocument.removeEventListener("pointerdown", ends, true);
    ownerDocument.removeEventListener("keydown", ends, true);
  };
  for (const type of WITHHELD) {
    ownerDocument.addEventListener(type, withhold, true);
  }
  ownerDocument.addEventListener("pointerdown", ends, true);
  ownerDocument.addEventListener("keydown", ends, true);
};

export function useTapOutside(active: boolean, inside: (target: Element) => boolean, onTap: () => void) {
  const latest = useRef({ inside, onTap });
  latest.current = { inside, onTap };
  useEffect(() => {
    if (!active) {
      return;
    }
    const press = (event: PointerEvent) => {
      const target = event.target;
      if (!touchPointer(event.pointerType) || event.button !== 0 || !(target instanceof Element) || latest.current.inside(target)) {
        return;
      }
      swallowTap(event);
      event.stopPropagation();
      latest.current.onTap();
    };
    document.addEventListener("pointerdown", press, true);
    return () => document.removeEventListener("pointerdown", press, true);
  }, [active]);
}
