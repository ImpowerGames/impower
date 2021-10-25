export const setScrollX = (element: HTMLElement, value: number): void => {
  if (!element) {
    return;
  }
  if (element === document.documentElement) {
    window.scroll(value, window.scrollY);
  } else {
    element.scrollLeft = value;
  }
};
