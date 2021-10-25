export const getScrollXMax = (element: HTMLElement): number => {
  if (!element) {
    return 0;
  }
  if (element === document.documentElement) {
    const scrollWidth = Math.max(
      document.body.scrollWidth,
      document.body.offsetWidth,
      document.documentElement.clientWidth,
      document.documentElement.scrollWidth,
      document.documentElement.offsetWidth
    );
    return scrollWidth - window.innerWidth;
  }
  return element.scrollWidth - element.clientLeft;
};
