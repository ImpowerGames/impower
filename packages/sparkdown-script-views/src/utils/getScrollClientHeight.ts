export const getScrollClientHeight = (target: EventTarget | null) => {
  if (target instanceof HTMLElement) {
    return target.clientHeight;
  }
  return document.documentElement.clientHeight;
};
