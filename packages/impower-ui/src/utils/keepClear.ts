import type { RefObject } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

export type KeepClear = RefObject<HTMLElement | null>;

export const KEEP_CLEAR_GAP = 6;

export const KEEP_CLEAR_MARGIN = 4;

export const KEEP_CLEAR_RULE =
  "keepClear: the part stays below the bottom of the kept-clear element, 6px clear, and follows it while open. It shrinks to fit the room left, down to a minimum that still shows its header, if it has one, and one whole row. Short of that minimum it gives things up in this order: first its margins on the side it opens, from the window's edge and then from what opened it, each down to 4px; then, only where it can rise by the shortfall alone without moving to the other side of what opened it, it rises over the element by that much. Where it cannot, it keeps to the room it has and scrolls within itself rather than covering more of the element. A backdrop behind the part dims only what lies below the line the part keeps to, never the kept-clear element, and a press on the kept-clear element leaves the part open and reaches the element.";

export const keepsClear = (keepClear: KeepClear | undefined, target: EventTarget | null): boolean =>
  target instanceof Node && !!keepClear?.current?.contains(target);

export const clearLine = (keepClear: KeepClear | undefined): number | undefined => {
  const element = keepClear?.current;
  return element ? element.getBoundingClientRect().bottom + KEEP_CLEAR_GAP : undefined;
};

export function useClearLine<T>(
  keepClear: KeepClear | undefined,
  active: boolean,
  measure: (line: number) => T,
  within?: RefObject<HTMLElement | null>,
): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  const latest = useRef(measure);
  latest.current = measure;
  useLayoutEffect(() => {
    const element = keepClear?.current;
    if (!active || !element) {
      setValue(undefined);
      return;
    }
    const update = () => {
      const line = clearLine(keepClear);
      setValue(line === undefined ? undefined : latest.current(line));
    };
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    if (within?.current) {
      observer?.observe(within.current);
    }
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [active, keepClear, within]);
  if (!active) {
    return undefined;
  }
  if (value !== undefined) {
    return value;
  }
  const line = clearLine(keepClear);
  return line === undefined ? undefined : measure(line);
}
