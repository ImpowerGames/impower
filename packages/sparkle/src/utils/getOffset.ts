// workaround(chromium): a slotted element's offsetParent ignores elements in the surrounding shadow DOM, https://bugs.chromium.org/p/chromium/issues/detail?id=920069
export const getOffset = (element: HTMLElement, parent: HTMLElement) => {
  return {
    top: Math.round(
      element.getBoundingClientRect().top - parent.getBoundingClientRect().top,
    ),
    left: Math.round(
      element.getBoundingClientRect().left -
        parent.getBoundingClientRect().left,
    ),
  };
};
