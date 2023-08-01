export const getScrollTop = (target: EventTarget | null) => {
  if (target instanceof HTMLElement) {
    return target.scrollTop;
  }
  return window.scrollY;
};
