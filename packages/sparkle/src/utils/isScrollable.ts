export const isScrollable = (el: HTMLElement): boolean => {
  const hasScrollableContent = el.scrollHeight > el.clientHeight;

  const overflowYStyle = window.getComputedStyle(el).overflowY;
  const isOverflowHidden = overflowYStyle.indexOf("hidden") !== -1;

  return hasScrollableContent && !isOverflowHidden;
};
