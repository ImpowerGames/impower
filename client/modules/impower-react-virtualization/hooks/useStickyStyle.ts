import { useEffect, useRef } from "react";
import { getOffset } from "../utils/getOffset";
import { getScrollY } from "../utils/getScrollY";

export const useStickyStyle = (
  stickyElement: HTMLElement,
  scrollParent: HTMLElement,
  stickyStyle: {
    position?: string;
    zIndex?: number;
    boxShadow?: string;
    top?: number;
    left?: number;
    right?: number;
    paddingBottom?: number;
    paddingLeft?: number;
    paddingRight?: number;
  } = { position: "fixed", zIndex: 2 },
  sticky: "always" | "collapsible" | "never" = "never",
  stickyOffset: number = undefined,
  onScrollPast: (scrolledPast: boolean) => void = undefined
): void => {
  const scrollY = useRef<number>();
  const lastCollapsedScrollY = useRef<number>(0);
  const lastRevealedScrollY = useRef<number>(0);
  const collapsed = useRef<boolean>();
  const stickyTop = useRef<number>();
  const scrolledPast = useRef<boolean>();
  const targetEl = useRef<HTMLElement>();

  useEffect(() => {
    const offset =
      stickyOffset !== undefined
        ? stickyOffset
        : getOffset(stickyElement, scrollParent) || 0;
    const height = stickyElement ? stickyElement.offsetHeight : 0;

    if (stickyElement) {
      stickyElement.style.willChange = "transform";
    }

    const handleScroll = (): void => {
      if (stickyElement) {
        if (sticky === "never") {
          if (targetEl.current) {
            targetEl.current.style.zIndex = null;
            targetEl.current.style.top = null;
            targetEl.current.style.left = null;
            targetEl.current.style.right = null;
            targetEl.current.style.position = null;
            targetEl.current.style.boxShadow = null;
            targetEl.current.style.paddingBottom = null;
            targetEl.current.style.paddingLeft = null;
            targetEl.current.style.paddingRight = null;
          }
          targetEl.current = undefined;
        }

        if (sticky === "always") {
          const newScrollY = getScrollY(scrollParent);
          const newScrolledPastThreshold = newScrollY > offset;

          stickyElement.style.position = stickyStyle?.position;
          stickyElement.style.top = `${stickyStyle?.top || 0}px`;
          stickyElement.style.left = `${stickyStyle?.left || 0}px`;
          stickyElement.style.right = `${stickyStyle?.right || 0}px`;
          stickyElement.style.paddingBottom = `${
            stickyStyle?.paddingBottom || 0
          }px`;
          stickyElement.style.paddingLeft = `${
            stickyStyle?.paddingLeft || 0
          }px`;
          stickyElement.style.paddingRight = `${
            stickyStyle?.paddingRight || 0
          }px`;
          stickyElement.style.zIndex = stickyStyle?.zIndex?.toString();
          stickyElement.style.willChange = "transform";
          stickyElement.style.transform = `translateZ(0)`;

          if (newScrolledPastThreshold) {
            stickyElement.style.boxShadow = stickyStyle?.boxShadow;
          } else {
            stickyElement.style.boxShadow = null;
          }

          if (newScrolledPastThreshold !== scrolledPast.current) {
            scrolledPast.current = newScrolledPastThreshold;
            if (onScrollPast) {
              onScrollPast(newScrolledPastThreshold);
            }
          }
          targetEl.current = stickyElement;
        }

        if (sticky === "collapsible") {
          targetEl.current = stickyElement;
          const newScrollY = getScrollY(scrollParent);
          if (newScrollY >= 0) {
            const scrollYDelta =
              scrollY.current === undefined ? 0 : newScrollY - scrollY.current;
            scrollY.current = newScrollY;
            const collapse = scrollYDelta > 0;
            const distance = collapse
              ? Math.abs(newScrollY - lastRevealedScrollY.current)
              : Math.abs(newScrollY - lastCollapsedScrollY.current);
            if (newScrollY > 0 && distance < 10) {
              return;
            }
            if (collapsed.current === collapse) {
              return;
            }
            collapsed.current = collapse;
            if (collapse) {
              lastCollapsedScrollY.current = newScrollY;
            } else {
              lastRevealedScrollY.current = newScrollY;
            }
            const newStickyTop = collapse ? -height - 1 : 0;
            stickyTop.current = newStickyTop;
            stickyElement.style.position = "fixed";
            stickyElement.style.top = `${offset + (stickyStyle?.top || 0)}px`;
            stickyElement.style.left = `${stickyStyle?.left || 0}px`;
            stickyElement.style.right = `${stickyStyle?.right || 0}px`;
            stickyElement.style.paddingBottom = `${
              stickyStyle?.paddingBottom || 0
            }px`;
            stickyElement.style.paddingLeft = `${
              stickyStyle?.paddingLeft || 0
            }px`;
            stickyElement.style.paddingRight = `${
              stickyStyle?.paddingRight || 0
            }px`;
            stickyElement.style.zIndex = stickyStyle?.zIndex?.toString();
            stickyElement.style.transform = `translateY(${stickyTop.current}px)`;

            const newScrolledPast = stickyTop.current < 0;
            if (newScrolledPast) {
              stickyElement.style.boxShadow = stickyStyle?.boxShadow;
            } else {
              stickyElement.style.boxShadow = null;
            }

            if (newScrolledPast !== scrolledPast.current) {
              scrolledPast.current = newScrolledPast;
              if (onScrollPast) {
                onScrollPast(newScrolledPast);
              }
            }
          }
        }
      }
    };

    handleScroll();

    if (scrollParent === document.documentElement) {
      window.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    } else if (scrollParent) {
      scrollParent.addEventListener("scroll", handleScroll, {
        passive: true,
      });
    }

    return (): void => {
      if (scrollParent === document.documentElement) {
        window.removeEventListener("scroll", handleScroll);
      } else if (scrollParent) {
        scrollParent.removeEventListener("scroll", handleScroll);
      }
    };
  }, [
    stickyElement,
    scrollParent,
    sticky,
    stickyStyle?.top,
    stickyStyle?.zIndex,
    stickyStyle?.left,
    stickyStyle?.right,
    stickyStyle?.position,
    stickyStyle?.boxShadow,
    stickyStyle?.paddingBottom,
    stickyStyle?.paddingLeft,
    stickyStyle?.paddingRight,
    onScrollPast,
    stickyOffset,
  ]);
};
