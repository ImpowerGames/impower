import { createElement, removeAttribute, setAttribute } from "./dom";
import { VElement, VNode } from "./vnode";

export function diffAndPatch(
  parent: Node,
  oldVNode: VNode | null,
  newVNode: VNode | null,
  index: number = 0
): void {
  const existing = parent?.childNodes[index] || null;

  const oldIsText = typeof oldVNode === "string";
  const newIsText = typeof newVNode === "string";

  const oldEl = oldVNode as VElement;
  const newEl = newVNode as VElement;

  const oldIsFrag = oldEl.tag === "fragment";
  const newIsFrag = newEl.tag === "fragment";

  // REMOVE
  if (oldVNode != null && newVNode == null) {
    if (oldIsFrag) {
      // recurse into each child, removing them properly
      for (const child of oldEl.children) {
        diffAndPatch(parent, child, null, index);
      }
    } else {
      // plain text or element - just remove it
      if (existing) {
        parent.removeChild(existing);
      }
    }
    return;
  }

  // INSERT
  if (oldVNode == null && newVNode != null) {
    parent.insertBefore(createElement(newVNode), existing);
    return;
  }

  // FRAGMENT → FRAGMENT: just diff children inline
  if (oldIsFrag && newIsFrag) {
    const oldChildren = oldEl.children;
    const newChildren = newEl.children;
    const oldLen = oldChildren.length;
    const newLen = newChildren.length;

    // 1) REMOVE any old extra nodes, from the end backward:
    for (let i = oldLen - 1; i >= newLen; i--) {
      const nodeToRemove = parent.childNodes[index + i];
      if (nodeToRemove) {
        parent.removeChild(nodeToRemove);
      }
    }

    // 2) DIFF the common nodes in forward order:
    const commonLen = Math.min(oldLen, newLen);
    for (let i = 0; i < commonLen; i++) {
      diffAndPatch(parent, oldChildren[i], newChildren[i], index + i);
    }

    // 3) INSERT any new extra nodes:
    for (let i = oldLen; i < newLen; i++) {
      const refNode = parent.childNodes[index + i] || null;
      parent.insertBefore(createElement(newChildren[i]), refNode);
    }
    return;
  }

  // FRAGMENT → ELEMENT|TEXT
  if (oldIsFrag && !newIsFrag) {
    // How many real DOM nodes we expect to remove:
    const removeCount = oldEl.children.length;

    // Collect the next `removeCount` nodes at position `index`
    const toRemove: Node[] = [];
    for (let i = 0; i < removeCount; i++) {
      const node = parent.childNodes[index + i];
      if (node) {
        toRemove.push(node);
      }
    }

    // Remove them
    for (const node of toRemove) {
      parent.removeChild(node);
    }

    if (newVNode) {
      // Insert the new element in their place
      const newDom = createElement(newVNode);
      const ref = parent.childNodes[index] || null;
      parent.insertBefore(newDom, ref);
    }

    return;
  }

  // ELEMENT|TEXT → FRAGMENT
  if (!oldIsFrag && newIsFrag) {
    // remove the one old element
    if (existing) {
      parent.removeChild(existing);
    }
    // insert each of the new fragment's children in turn
    for (let i = 0; i < newEl.children.length; i++) {
      parent.insertBefore(
        createElement(newEl.children[i]),
        parent.childNodes[index + i] || null
      );
    }
    return;
  }

  // TEXT → TEXT: update in place
  if (oldIsText && newIsText) {
    if (oldVNode !== newVNode) {
      parent.replaceChild(createElement(newVNode!), existing!);
    }
    return;
  }

  // TEXT ⇄ ELEMENT: replace entire node
  if (oldIsText !== newIsText) {
    // build the new DOM node
    const newDom = createElement(newVNode!);

    // if there's an existing node, replace it...
    if (existing) {
      parent.replaceChild(newDom, existing);
    }
    // ...otherwise insert it at the correct position
    else {
      parent.insertBefore(newDom, parent.childNodes[index] || null);
    }
    return;
  }

  // ELEMENT ⇄ ELEMENT
  // tag or key changed: replace the entire element
  if (oldEl.tag !== newEl.tag || oldEl.key !== newEl.key) {
    parent.replaceChild(createElement(newEl), existing!);
    return;
  }

  // same element: update props + recurse
  if (existing instanceof Element) {
    updateProps(existing, oldEl.props, newEl.props);

    const oldChildren = oldEl.children;
    const newChildren = newEl.children;
    const oldLen = oldChildren.length;
    const newLen = newChildren.length;

    // 1) REMOVE any old extra nodes, from the end backward:
    for (let i = oldLen - 1; i >= newLen; i--) {
      const node = existing.childNodes[i];
      if (node) existing.removeChild(node);
    }

    // 2) DIFF the common nodes in forward order:
    const commonLen = Math.min(oldLen, newLen);
    for (let i = 0; i < commonLen; i++) {
      diffAndPatch(existing, oldChildren[i], newChildren[i], i);
    }

    // 3) INSERT any new extra nodes:
    for (let i = oldLen; i < newLen; i++) {
      const refNode = existing.childNodes[i] || null;
      existing.insertBefore(createElement(newChildren[i]), refNode);
    }
  }
}

function updateProps(
  el: Element,
  oldProps: Record<string, string>,
  newProps: Record<string, string>
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
