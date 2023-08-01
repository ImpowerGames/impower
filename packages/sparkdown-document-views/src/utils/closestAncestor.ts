export const closestAncestor = (
  selector: string,
  el: Element | HTMLElement
): HTMLElement | null => {
  if (!el || el instanceof Document || el instanceof Window) {
    return null;
  }
  const result = el.closest(selector);
  if (result) {
    return result as HTMLElement;
  }
  const host = (el.getRootNode() as ShadowRoot)?.host;
  if (!host || host === el) {
    return null;
  }
  return closestAncestor(selector, host);
};
