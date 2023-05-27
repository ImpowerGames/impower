export const getContainerHeight = (element: HTMLElement): number => {
  if (!element) {
    return 0;
  }
  if (element === document.documentElement) {
    return document.documentElement.clientHeight;
  }
  return element.offsetHeight;
};
