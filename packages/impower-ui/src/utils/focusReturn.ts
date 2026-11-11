const owners = new WeakMap<Element, () => HTMLElement | null>();

export function registerFocusReturn(
  element: Element,
  target: () => HTMLElement | null,
) {
  owners.set(element, target);
}

export function focusReturnTarget(
  active: Element | null,
): () => HTMLElement | null {
  for (let node = active; node; node = node.parentElement) {
    const target = owners.get(node);
    if (target) {
      return target;
    }
  }
  const element = active instanceof HTMLElement ? active : null;
  return () => element;
}
