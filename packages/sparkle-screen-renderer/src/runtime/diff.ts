import { createElement } from "./dom";
import { VNode } from "./vnode";

export type DOMMutation =
  | { type: "insert"; parent: Node; node: Node; refNode: Node | null }
  | { type: "remove"; parent: Node; node: Node }
  | { type: "replace"; parent: Node; oldNode: Node; newNode: Node }
  | { type: "updateText"; node: Node; text: string }
  | {
      type: "updateProps";
      node: Element;
      oldProps: Record<string, string>;
      newProps: Record<string, string>;
    };

const mutationQueue: DOMMutation[] = [];
let scheduled = false;

export function diffAndPatch(
  container: Node,
  oldVNode: VNode | null,
  newVNode: VNode,
  index: number = 0
): void {
  const existingNode = container.childNodes[index];

  // 1. No old node -> Insert
  if (!oldVNode) {
    mutationQueue.push({
      type: "insert",
      parent: container,
      node: createElement(newVNode),
      refNode: existingNode || null,
    });
    scheduleFlush();
    return;
  }

  // 2. No new node -> Remove
  if (!newVNode) {
    if (existingNode) {
      mutationQueue.push({
        type: "remove",
        parent: container,
        node: existingNode,
      });
      scheduleFlush();
    }
    return;
  }

  // 3. Different types -> Replace
  if (
    typeof oldVNode !== typeof newVNode ||
    (typeof oldVNode !== "string" &&
      typeof newVNode !== "string" &&
      oldVNode.tag !== newVNode.tag)
  ) {
    if (existingNode) {
      mutationQueue.push({
        type: "replace",
        parent: container,
        oldNode: existingNode,
        newNode: createElement(newVNode),
      });
      scheduleFlush();
    }
    return;
  }

  // 4. Text nodes
  if (typeof oldVNode === "string" && typeof newVNode === "string") {
    if (oldVNode !== newVNode && existingNode?.nodeType === Node.TEXT_NODE) {
      mutationQueue.push({
        type: "updateText",
        node: existingNode,
        text: newVNode,
      });
      scheduleFlush();
    }
    return;
  }

  /* 4.  Element / Fragment handling   */
  if (typeof oldVNode !== "string" && typeof newVNode !== "string") {
    /*  4a. Both are *fragments* -> diff their children in place */
    if (oldVNode.tag === "fragment" && newVNode.tag === "fragment") {
      diffChildren(container, oldVNode.children, newVNode.children, index);
      return;
    }

    /*  4b.   old = fragment -------- new = element */
    if (oldVNode.tag === "fragment") {
      // Remove the old fragment’s real nodes
      removeDomRange(container, index, domLen(oldVNode));
      // Insert the new element
      mutationQueue.push({
        type: "insert",
        parent: container,
        node: createElement(newVNode),
        refNode: container.childNodes[index] || null,
      });
      scheduleFlush();
      return;
    }

    /*  4c.   old = element -------- new = fragment */
    if (newVNode.tag === "fragment") {
      // Patch by replacing the element with the fragment’s real nodes
      mutationQueue.push({
        type: "remove",
        parent: container,
        node: existingNode,
      });
      mutationQueue.push({
        type: "insert",
        parent: container,
        node: createElement(newVNode), // DocumentFragment
        refNode: container.childNodes[index] || null,
      });
      scheduleFlush();
      return;
    }

    /*  4e.   normal element diff */
    const el = existingNode as Element;
    if (!el) {
      mutationQueue.push({
        type: "insert",
        parent: container,
        node: createElement(newVNode),
        refNode: null,
      });
      scheduleFlush();
      return;
    }

    mutationQueue.push({
      type: "updateProps",
      node: el,
      oldProps: oldVNode.props,
      newProps: newVNode.props,
    });
    scheduleFlush();

    const oldChildren = oldVNode.children || [];
    const newChildren = newVNode.children || [];
    diffChildren(el, oldChildren, newChildren);
  }
}

function diffChildren(
  parent: Node,
  oldKids: VNode[],
  newKids: VNode[],
  domStart = 0 // where the *first* old child begins
): void {
  let oldIndex = 0;
  let newIndex = 0;
  let domPtr = domStart;

  /* 1. sync common prefix */
  while (
    oldIndex < oldKids.length &&
    newIndex < newKids.length &&
    isSameVNode(oldKids[oldIndex], newKids[newIndex])
  ) {
    diffAndPatch(parent, oldKids[oldIndex], newKids[newIndex], domPtr);
    domPtr += domLen(oldKids[oldIndex]);
    oldIndex++;
    newIndex++;
  }

  /* 2. sync common suffix */
  let oldEnd = oldKids.length - 1,
    newEnd = newKids.length - 1;
  let domEnd = domStart + oldKids.reduce((t, c) => t + domLen(c), 0);
  while (
    oldEnd >= oldIndex &&
    newEnd >= newIndex &&
    isSameVNode(oldKids[oldEnd], newKids[newEnd])
  ) {
    const len = domLen(oldKids[oldEnd]);
    domEnd -= len;
    diffAndPatch(parent, oldKids[oldEnd], newKids[newEnd], domEnd);
    oldEnd--;
    newEnd--;
  }

  /* 3. pure inserts */
  if (oldIndex > oldEnd) {
    const ref = parent.childNodes[domEnd] || null;
    for (let i = newIndex; i <= newEnd; i++) {
      parent.insertBefore(createElement(newKids[i]), ref);
    }
    return;
  }

  /* 4. pure removals */
  if (newIndex > newEnd) {
    removeDomRange(parent, domPtr, domEnd - domPtr);
    return;
  }

  /* 5. keyed diff (uses real DOM offsets) */
  const keyToOld = new Map<string, { idx: number; domOff: number }>();
  let scan = domPtr;
  for (let i = oldIndex; i <= oldEnd; i++) {
    const oldKid = oldKids[i]!;
    const k = typeof oldKid !== "string" && oldKid.key ? oldKid.key : null;
    if (k != null) keyToOld.set(k, { idx: i, domOff: scan });
    scan += domLen(oldKid);
  }

  let newDomPtr = domPtr;
  for (let i = newIndex; i <= newEnd; i++) {
    const nkid = newKids[i];
    const k = typeof nkid !== "string" && nkid.key ? nkid.key : null;

    if (k != null && keyToOld.has(k)) {
      const { idx: oidx, domOff } = keyToOld.get(k)!;
      diffAndPatch(parent, oldKids[oidx], nkid, domOff);

      /* move if necessary */
      if (domOff !== newDomPtr) {
        const node = parent.childNodes[domOff];
        parent.insertBefore(node, parent.childNodes[newDomPtr] || null);
      }
      keyToOld.delete(k);
    } else {
      /* un-keyed node */
      if (
        oldIndex <= oldEnd &&
        typeof oldKids[oldIndex] === typeof nkid &&
        (typeof nkid === "string" ||
          (typeof nkid !== "string" &&
            !(oldKids[oldIndex] as VNode & { key?: string }).key))
      ) {
        diffAndPatch(parent, oldKids[oldIndex], nkid, newDomPtr);
        oldIndex++; // consume one old kid
      } else {
        parent.insertBefore(
          createElement(nkid),
          parent.childNodes[newDomPtr] || null
        );
      }
    }
    newDomPtr += domLen(nkid);
  }

  /* remove leftovers */
  for (const { domOff } of keyToOld.values()) {
    const len = domLen(oldKids[domOffset(oldKids, 0)]); // quick look-up
    removeDomRange(parent, domOff, len);
  }
}

function isSameVNode(a: VNode, b: VNode): boolean {
  if (typeof a !== typeof b) return false;
  if (typeof a === "string" && typeof b === "string") return a === b;
  if (typeof a !== "string" && typeof b !== "string") {
    return a.tag === b.tag && (a.key ?? null) === (b.key ?? null);
  }
  return false;
}

function updatePropsImmediate(
  el: Element,
  oldProps: Record<string, string>,
  newProps: Record<string, string>
): void {
  // Remove old props
  for (const key in oldProps) {
    if (!(key in newProps)) {
      el.removeAttribute(key);
    }
  }
  // Update or add new props
  for (const key in newProps) {
    if (newProps[key] !== oldProps[key]) {
      el.setAttribute(key, newProps[key]);
    }
  }
}

function scheduleFlush() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(flushMutations);
}

function flushMutations() {
  for (const m of mutationQueue) {
    switch (m.type) {
      case "insert":
        m.parent.insertBefore(m.node, m.refNode);
        break;
      case "remove":
        m.parent.removeChild(m.node);
        break;
      case "replace":
        m.parent.replaceChild(m.newNode, m.oldNode);
        break;
      case "updateText":
        if (m.node.textContent !== m.text) {
          m.node.textContent = m.text;
        }
        break;
      case "updateProps":
        updatePropsImmediate(m.node, m.oldProps, m.newProps);
        break;
    }
  }
  mutationQueue.length = 0;
  scheduled = false;
}

function domLen(v: VNode): number {
  if (typeof v === "string") return 1; // text
  if (v.tag === "fragment")
    return v.children.reduce((n, c) => n + domLen(c), 0);
  return 1; // normal element
}

function domOffset(children: VNode[], to: number): number {
  // Sum of real nodes rendered by children[0‥to-1]
  let n = 0;
  for (let i = 0; i < to; i++) n += domLen(children[i]);
  return n;
}

function removeDomRange(parent: Node, from: number, count: number): void {
  for (let i = 0; i < count; i++) {
    const node = parent.childNodes[from];
    parent.removeChild(node);
  }
}
