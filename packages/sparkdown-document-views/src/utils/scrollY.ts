import { isScrollable } from "./isScrollable";

export const scrollY = (
  y: number,
  ...possibleScrollers: (HTMLElement | null | undefined)[]
) => {
  const scroller =
    possibleScrollers.find((s) => s && isScrollable(s)) ??
    (isScrollable(document.documentElement) ? document : undefined);
  if (scroller) {
    const scrollHeight =
      scroller instanceof Document
        ? document.documentElement.scrollHeight
        : scroller.scrollHeight;
    const validY = y === Infinity ? scrollHeight : y;
    if (scroller instanceof Document) {
      window.scrollTo(0, validY);
    } else {
      scroller.scrollTop = validY;
    }
  }
};
