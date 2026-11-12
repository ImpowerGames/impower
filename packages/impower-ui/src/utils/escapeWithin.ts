import type { RefObject } from "preact";
import { useEffect, useRef } from "preact/hooks";

export function useEscapeWithin(within: RefObject<Element>, active: boolean, onEscape: () => void) {
  const latest = useRef(onEscape);
  latest.current = onEscape;
  useEffect(() => {
    if (!active) {
      return;
    }
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !within.current?.contains(event.target as Node | null)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      latest.current();
    };
    window.addEventListener("keydown", escape, true);
    return () => window.removeEventListener("keydown", escape, true);
  }, [active]);
}
