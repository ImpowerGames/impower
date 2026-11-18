import type { RefObject } from "preact";
import { useLayoutEffect, useState } from "preact/hooks";

export const NARROW_PANE_WIDTH = 440;

export function useNarrowPane(body: RefObject<HTMLElement>): boolean | undefined {
  const [narrow, setNarrow] = useState<boolean | undefined>(undefined);
  useLayoutEffect(() => {
    const element = body.current;
    if (!element) {
      return;
    }
    const read = () => {
      const style = getComputedStyle(element);
      const inset = ["paddingLeft", "paddingRight", "borderLeftWidth", "borderRightWidth"] as const;
      const width = inset.reduce((rest, side) => rest - (parseFloat(style[side]) || 0), element.getBoundingClientRect().width);
      setNarrow(width > 0 && width <= NARROW_PANE_WIDTH);
    };
    read();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(read);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return narrow;
}
