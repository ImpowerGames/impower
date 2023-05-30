export const getScrollY = (element: HTMLElement): number => {
  if (!element) {
    return 0;
  }
  if (element === document.documentElement) {
    return window.pageYOffset;
  }
  return element.scrollTop;
};
