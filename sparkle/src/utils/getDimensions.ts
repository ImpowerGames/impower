export const getDimensions = (el: Element): DOMRect => {
  let parent = el.parentElement;
  let parentRect = el.parentElement?.getBoundingClientRect();
  while (
    parent &&
    (!parentRect || (parentRect.width === 0 && parentRect.height === 0))
  ) {
    parent = parent.parentElement;
    parentRect = parent?.getBoundingClientRect();
  }
  return parentRect ?? new DOMRect();
};
