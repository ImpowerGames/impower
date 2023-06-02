import { useEffect } from "react";
import { getScrollX } from "../utils/getScrollX";
import { getScrollY } from "../utils/getScrollY";

export const useScrollEffect = (
  scrollParent: HTMLElement,
  onScroll: (position: { scrollX: number; scrollY: number }) => void
): void => {
  useEffect(() => {
    if (!scrollParent) {
      return (): void => null;
    }

    const handleScroll = (): void => {
      if (scrollParent) {
        const scrollX = getScrollX(scrollParent);
        const scrollY = getScrollY(scrollParent);
        onScroll({ scrollX, scrollY });
      }
    };

    handleScroll();

    if (scrollParent === document.documentElement) {
      window.addEventListener("scroll", handleScroll, { passive: true });
    } else {
      scrollParent.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    }

    return (): void => {
      if (scrollParent === document.documentElement) {
        window.removeEventListener("scroll", handleScroll);
      } else {
        scrollParent.removeEventListener("scroll", handleScroll);
      }
    };
  }, [onScroll, scrollParent]);
};
