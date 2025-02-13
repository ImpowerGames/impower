import { isScrollable } from "./isScrollable";

export const scrollY = (
  y: number,
  ...possibleScrollers: (Window | Element | null | undefined)[]
) => {
  const scroller = possibleScrollers.find((s) => s && isScrollable(s));
  const scrollerEl =
    scroller instanceof Element ? scroller : document.documentElement;
  if (scrollerEl) {
    const scrollHeight =
      scrollerEl === document.documentElement
        ? document.documentElement.scrollHeight
        : scrollerEl.scrollHeight;
    const validY = y === Infinity ? scrollHeight : y;
    if (scrollerEl === document.documentElement) {
      window.scrollTo(0, validY);
    } else {
      scrollerEl.scrollTop = validY;
    }
  }
};
