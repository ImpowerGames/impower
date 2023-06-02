export const setScrollY = (element: HTMLElement, value: number): void => {
  if (!element) {
    return;
  }
  if (element === document.documentElement) {
    window.scroll(window.scrollX, value);
  } else {
    element.scrollTop = value;
  }
};
