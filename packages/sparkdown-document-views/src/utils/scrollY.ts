import { isScrollable } from "./isScrollable";

export const scrollY = (
  y: number,
  ...possibleScrollers: (HTMLElement | null | undefined)[]
) => {
  const scroller = possibleScrollers.find((s) => s && isScrollable(s));
  if (scroller) {
    const scrollHeight =
      scroller === document.documentElement
        ? document.documentElement.scrollHeight
        : scroller.scrollHeight;
    const validY = y === Infinity ? scrollHeight : y;
    if (scroller === document.documentElement) {
      window.scrollTo(0, validY);
    } else {
      scroller.scrollTop = validY;
    }
  }
};
