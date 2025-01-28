export const isScrollable = (el: Element): boolean => {
  const overflowYStyle = window.getComputedStyle(el).overflowY;
  return overflowYStyle === "scroll" || overflowYStyle === "auto";
};
