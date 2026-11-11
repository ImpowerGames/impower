const owners = new WeakMap<Element, () => HTMLElement | null>();
let handoff: HTMLElement | null = null;

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

export function handFocusOff(from: HTMLElement | null) {
  handoff = from;
}

export function focusOrigin(): () => HTMLElement | null {
  const from = handoff;
  handoff = null;
  const active = typeof document === "undefined" ? null : document.activeElement;
  if (from && (!active || active === document.body)) {
    return () => from;
  }
  return focusReturnTarget(active);
}
