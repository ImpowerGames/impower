import { useEffect, useState } from "react";
import { getScrollbarWidth } from "../utils/getScrollbarWidth";

export function useScrollbarWidth(): number | undefined {
  const [sbw, setSbw] = useState(getScrollbarWidth());

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setSbw(getScrollbarWidth());
    });
    return (): void => {
      cancelAnimationFrame(raf);
    };
  }, []);

  return sbw;
}
