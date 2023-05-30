export const getContainerWidth = (element: HTMLElement): number => {
  if (!element) {
    return 0;
  }
  if (element === document.documentElement) {
    return document.documentElement.clientWidth;
  }
  return element.offsetWidth;
};
