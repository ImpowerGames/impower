export const getScrollX = (element: HTMLElement): number => {
  if (!element) {
    return 0;
  }
  if (element === document.documentElement) {
    return window.pageXOffset;
  }
  return element.scrollLeft;
};
