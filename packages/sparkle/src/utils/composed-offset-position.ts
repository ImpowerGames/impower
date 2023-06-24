/*
 * composed-offset-position - https://github.com/jcfranco/composed-offset-position
 * Version - 0.0.4
 * Released under the MIT License
 *
 * Copyright (c) 2023 composed-offset-position contributors
 */

export const offsetParent = (element: HTMLElement): HTMLElement | null => {
  return offsetParentPolyfill(element);
};

export const offsetTop = (element: HTMLElement): number => {
  return offsetTopLeftPolyfill(element, "offsetTop");
};

export const offsetLeft = (element: HTMLElement): number => {
  return offsetTopLeftPolyfill(element, "offsetLeft");
};

const flatTreeParent = (element: Element): HTMLElement | null => {
  if (element.assignedSlot) {
    return element.assignedSlot;
  }

  if (element.parentNode instanceof ShadowRoot) {
    return element.parentNode.host as HTMLElement;
  }

  return element.parentNode as HTMLElement;
};

const ancestorTreeScopes = (element: Element): Set<Node> => {
  const scopes = new Set<Node>();
  let currentScope: Node | null = element.getRootNode();
  while (currentScope) {
    scopes.add(currentScope);
    currentScope = currentScope.parentNode
      ? currentScope.parentNode.getRootNode()
      : null;
  }

  return scopes;
};

const offsetParentPolyfill = (element: HTMLElement): HTMLElement | null => {
  // Do an initial walk to check for display:none ancestors.
  for (
    let ancestor: ReturnType<typeof flatTreeParent> = element;
    ancestor;
    ancestor = flatTreeParent(ancestor)
  ) {
    if (!(ancestor instanceof Element)) {
      continue;
    }

    if (getComputedStyle(ancestor).display === "none") {
      return null;
    }
  }

  for (
    let ancestor = flatTreeParent(element);
    ancestor;
    ancestor = flatTreeParent(ancestor)
  ) {
    if (!(ancestor instanceof Element)) {
      continue;
    }

    const style = getComputedStyle(ancestor);
    // Display:contents nodes aren't in the layout tree so they should be skipped.
    if (style.display === "contents") {
      continue;
    }

    if (style.position !== "static" || style.filter !== "none") {
      return ancestor;
    }

    if (ancestor.tagName === "BODY") {
      return ancestor;
    }
  }

  return null;
};

const offsetTopLeftPolyfill = (
  element: HTMLElement,
  offsetTopOrLeft: "offsetTop" | "offsetLeft"
) => {
  let value = element[offsetTopOrLeft];
  let nextOffsetParent = offsetParentPolyfill(element);
  const scopes = ancestorTreeScopes(element);

  while (nextOffsetParent && !scopes.has(nextOffsetParent.getRootNode())) {
    value -= nextOffsetParent[offsetTopOrLeft];
    nextOffsetParent = offsetParentPolyfill(nextOffsetParent);
  }

  return value;
};
