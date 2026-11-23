import { useEffect, useRef } from "preact/hooks";
import { touchPointer } from "../layout/menuForm";

export const swallowNextClick = (ownerDocument: Document = document, pressing?: Event) => {
  const swallow = (event: MouseEvent) => {
    if (!event.isTrusted) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    stop();
  };
  const ends = (event: Event) => {
    if (event !== pressing) {
      stop();
    }
  };
  const stop = () => {
    ownerDocument.removeEventListener("click", swallow, true);
    for (const type of ["pointerdown", "pointercancel", "keydown"]) {
      ownerDocument.removeEventListener(type, ends, true);
    }
  };
  ownerDocument.addEventListener("click", swallow, true);
  for (const type of ["pointerdown", "pointercancel", "keydown"]) {
    ownerDocument.addEventListener(type, ends, true);
  }
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
      swallowNextClick(target.ownerDocument, event);
      latest.current.onTap();
    };
    window.addEventListener("pointerdown", press, true);
    return () => window.removeEventListener("pointerdown", press, true);
  }, [active]);
}
