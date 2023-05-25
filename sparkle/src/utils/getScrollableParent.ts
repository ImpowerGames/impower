import { isScrollable } from "./isScrollable";

export const getScrollableParent = (el: HTMLElement | null): HTMLElement => {
  return !el || el === document.body
    ? document.body
    : isScrollable(el)
    ? el
    : el.parentNode instanceof HTMLElement
    ? getScrollableParent(el.parentNode)
    : document.body;
};
