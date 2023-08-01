export const isScrollable = (el: HTMLElement): boolean => {
  const overflowYStyle = window.getComputedStyle(el).overflowY;
  return overflowYStyle === "scroll";
};
