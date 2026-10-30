import { createElement, removeAttribute, setAttribute } from "./dom";
import { VElement, VNode } from "./vnode";

export function diffAndPatch(
  parent: Node,
  oldVNode: VNode | null,
  newVNode: VNode | null,
  index: number = 0,
): void {
  const existing = parent?.childNodes[index] || null;

  const oldIsText = typeof oldVNode === "string";
  const newIsText = typeof newVNode === "string";

  const oldEl = oldVNode as VElement;
  const newEl = newVNode as VElement;

  const oldIsFrag = oldEl?.tag === "fragment";
  const newIsFrag = newEl?.tag === "fragment";

  const oldChildren = oldIsFrag ? flatten(oldEl.children) : oldEl.children;
  const newChildren = newIsFrag ? flatten(newEl.children) : newEl.children;
  const oldLen = oldChildren?.length;
  const newLen = newChildren?.length;

  if (oldVNode != null && !oldIsFrag && newVNode == null) {
    if (existing) {
      parent.removeChild(existing);
    }
    return;
  }

  if (oldVNode == null && newVNode != null) {
    parent.insertBefore(createElement(newVNode), existing);
    return;
  }

  if (oldIsFrag && !newIsFrag) {
    const removeCount = oldLen;

    for (let i = removeCount - 1; i >= 0; i--) {
      const node = parent.childNodes[index + i];
      if (node) {
        parent.removeChild(node);
      }
    }

    if (newVNode) {
      const newDom = createElement(newVNode);
      const ref = parent.childNodes[index] || null;
      parent.insertBefore(newDom, ref);
    }
    return;
  }

  if (!oldIsFrag && newIsFrag) {
    if (existing) {
      parent.removeChild(existing);
    }
    for (let i = 0; i < newLen; i++) {
      parent.insertBefore(
        createElement(newChildren[i]!),
        parent.childNodes[index + i] || null,
      );
    }
    return;
  }

  if (oldIsFrag && newIsFrag) {
    for (let i = oldLen - 1; i >= newLen; i--) {
      const nodeToRemove = parent.childNodes[index + i];
      if (nodeToRemove) {
        parent.removeChild(nodeToRemove);
      }
    }

    const commonLen = Math.min(oldLen, newLen);
    for (let i = 0; i < commonLen; i++) {
      diffAndPatch(parent, oldChildren[i]!, newChildren[i]!, index + i);
    }

    for (let i = oldLen; i < newLen; i++) {
      const refNode = parent.childNodes[index + i] || null;
      parent.insertBefore(createElement(newChildren[i]!), refNode);
    }
    return;
  }

  if (oldIsText && newIsText) {
    if (oldVNode !== newVNode) {
      parent.replaceChild(createElement(newVNode!), existing!);
    }
    return;
  }

  if (oldIsText !== newIsText) {
    const newDom = createElement(newVNode!);

    if (existing) {
      parent.replaceChild(newDom, existing);
    }
    else {
      parent.insertBefore(newDom, parent.childNodes[index] || null);
    }
    return;
  }

  if (oldEl.tag !== newEl.tag || oldEl.key !== newEl.key) {
    parent.replaceChild(createElement(newEl), existing!);
    return;
  }

  if (existing instanceof Element) {
    updateProps(existing, oldEl.props, newEl.props);

    for (let i = oldLen - 1; i >= newLen; i--) {
      const node = existing.childNodes[i];
      if (node) existing.removeChild(node);
    }

    const commonLen = Math.min(oldLen, newLen);
    for (let i = 0; i < commonLen; i++) {
      diffAndPatch(existing, oldChildren[i]!, newChildren[i]!, i);
    }

    for (let i = oldLen; i < newLen; i++) {
      const refNode = existing.childNodes[i] || null;
      existing.insertBefore(createElement(newChildren[i]!), refNode);
    }
    return;
  }
}

function updateProps(
  el: Element,
  oldProps: Record<string, string>,
  newProps: Record<string, string>,
) {
  for (const k of Object.keys(oldProps)) {
    if (!(k in newProps)) {
      removeAttribute(el, k);
    }
  }
  for (const [k, v] of Object.entries(newProps)) {
    if (oldProps[k] !== v) {
      setAttribute(el, k, v);
    }
  }
}

function flatten<V extends VNode>(children: VNode[]): V[] {
  return children.flatMap((c) =>
    typeof c === "string"
      ? [c as V]
      : c.tag === "fragment"
        ? flatten<V>((c as VElement).children)
        : [c as V],
  );
}
