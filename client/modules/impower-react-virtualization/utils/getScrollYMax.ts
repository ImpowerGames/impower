export const getScrollYMax = (element: HTMLElement): number => {
  if (!element) {
    return 0;
  }
  if (element === document.documentElement) {
    const scrollHeight = Math.max(
      document.body.scrollHeight,
      document.body.offsetHeight,
      document.documentElement.clientHeight,
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight
    );
    return scrollHeight - window.innerHeight;
  }
  return element.scrollHeight - element.clientTop;
};
