import { options, type VNode } from "preact";

type LinkedVNode = VNode & {
  __?: LinkedVNode | null;
  __k?: (LinkedVNode | null)[] | null;
};

// workaround(preact): an element vnode that bails out on strict equality takes its old twin's children without pointing them back at itself, so useId walks into a detached ancestor and restarts its counter (seen with preact 10.29.2)
export function repairVNodeParents(): void {
  const previous = options.diffed;
  options.diffed = (vnode) => {
    previous?.(vnode);
    const node = vnode as LinkedVNode;
    if (typeof node.type !== "string" || !Array.isArray(node.__k)) {
      return;
    }
    for (const child of node.__k) {
      if (child && typeof child === "object" && child.__ !== node) {
        child.__ = node;
      }
    }
  };
}
