import { useEffect, useState } from "react";

const isScrolledDown = (scrollThreshold: number): boolean => {
  const windowsScrollTop = window.pageYOffset;
  return windowsScrollTop > scrollThreshold;
};

export const isScrolledToBottom = (
  el: HTMLElement,
  threshold = 1,
  requiredScrollOffset = 0
): boolean => {
  if (el.scrollHeight - el.clientHeight > requiredScrollOffset) {
    return el.scrollHeight - el.clientHeight - el.scrollTop < threshold;
  }
  return false;
};

export const useScrolledDown = (scrollThreshold: number): boolean => {
  const [scrolledDown, setScrolledDown] = useState(false);

  const updateScrolledDown = (): void => {
    if (isScrolledDown(scrollThreshold)) {
      setScrolledDown(true);
    } else {
      setScrolledDown(false);
    }
  };
  useEffect(() => {
    window.addEventListener("scroll", updateScrolledDown, {
      passive: true,
    });
    window.addEventListener("resize", updateScrolledDown, {
      passive: true,
    });
    return (): void => {
      window.removeEventListener("scroll", updateScrolledDown);
      window.removeEventListener("resize", updateScrolledDown);
    };
  });

  return scrolledDown;
};
