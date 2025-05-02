import { createElement, setAttribute } from "./dom";
import { VElement, VNode } from "./vnode";

export function diffAndPatch(
  parent: Node,
  oldVNode: VNode | null,
  newVNode: VNode | null,
  index: number = 0
): void {
  const existing = parent?.childNodes[index] || null;

  // 1) INSERT
  if (oldVNode == null && newVNode != null) {
    parent.insertBefore(createElement(newVNode), existing);
    return;
  }

  // 2) REMOVE
  if (oldVNode != null && newVNode == null) {
    if (existing) {
      parent.removeChild(existing);
    }
    return;
  }

  // Now both oldVNode and newVNode are non‐null
  const oldIsText = typeof oldVNode === "string";
  const newIsText = typeof newVNode === "string";

  // 3a) both text: update in place
  if (oldIsText && newIsText) {
    if (oldVNode !== newVNode) {
      parent.replaceChild(createElement(newVNode!), existing!);
    }
    return;
  }

  // 3b) one is text, one is element: replace entire node
  if (oldIsText !== newIsText) {
    parent.replaceChild(createElement(newVNode!), existing!);
    return;
  }

  // both are VElements from here on
  const oldEl = oldVNode as VElement;
  const newEl = newVNode as VElement;

  // --- SPECIAL: FRAGMENT ↔ ELEMENT ---
  const oldIsFrag = oldEl.tag === "fragment";
  const newIsFrag = newEl.tag === "fragment";

  // 1) fragment → fragment: just diff children inline
  if (oldIsFrag && newIsFrag) {
    const oldC = oldEl.children,
      newC = newEl.children;
    const max = Math.max(oldC.length, newC.length);
    for (let i = 0; i < max; i++) {
      diffAndPatch(parent, oldC[i] ?? null, newC[i] ?? null, index + i);
    }
    return;
  }

  // 2) fragment → element
  if (oldIsFrag && !newIsFrag) {
    // remove exactly oldEl.children.length nodes, starting at `index`
    for (let i = 0; i < oldEl.children.length; i++) {
      parent.removeChild(parent.childNodes[index]);
    }
    // then insert the single new element
    parent.insertBefore(createElement(newEl), parent.childNodes[index] || null);
    return;
  }

  // 3) element → fragment
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

  // ----- FALLBACK: element ⇄ element -----
  // tag or key changed?
  if (oldEl.tag !== newEl.tag || oldEl.key !== newEl.key) {
    parent.replaceChild(createElement(newEl), existing!);
    return;
  }

  // same element: update props + recurse
  const el = existing as Element;
  updateProps(el, oldEl.props, newEl.props);

  const oldChildren = oldEl.children;
  const newChildren = newEl.children;
  const max = Math.max(oldChildren.length, newChildren.length);
  for (let i = 0; i < max; i++) {
    diffAndPatch(el, oldChildren[i] ?? null, newChildren[i] ?? null, i);
  }
}

function updateProps(
  el: Element,
  oldProps: Record<string, string>,
  newProps: Record<string, string>
) {
  for (const k of Object.keys(oldProps)) {
    if (!(k in newProps)) el.removeAttribute(k);
  }
  for (const [k, v] of Object.entries(newProps)) {
    if (oldProps[k] !== v) setAttribute(el, k, v);
  }
}
