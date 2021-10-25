import { Direction } from "../types/constants";

export const findScrollParent = (
  el: Element,
  scrollDirection?: Direction
): HTMLElement => {
  if (!el) {
    return document.documentElement;
  }
  if (
    !(el instanceof HTMLElement) ||
    typeof window.getComputedStyle !== "function"
  ) {
    return document.documentElement;
  }
  const computedStyle = window.getComputedStyle(el);
  if (
    ((!scrollDirection || scrollDirection === Direction.Vertical) &&
      el.scrollHeight >= el.clientHeight &&
      computedStyle.overflowY !== "hidden" &&
      computedStyle.overflowY !== "visible") ||
    ((!scrollDirection || scrollDirection === Direction.Horizontal) &&
      el.scrollWidth >= el.clientWidth &&
      computedStyle.overflowX !== "hidden" &&
      computedStyle.overflowX !== "visible")
  ) {
    return el;
  }
  return findScrollParent(el.parentElement, scrollDirection);
};
