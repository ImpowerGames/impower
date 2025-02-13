export const isScrollable = (el: Window | Element): boolean => {
  const element = el instanceof Element ? el : document.documentElement;
  const overflowYStyle = window.getComputedStyle(element).overflowY;
  return overflowYStyle === "scroll" || overflowYStyle === "auto";
};
