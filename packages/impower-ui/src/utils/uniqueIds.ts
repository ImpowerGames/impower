import { options, type VNode } from "preact";

type IdVNode = VNode & {
  __?: IdVNode | null;
  __k?: (IdVNode | null)[] | null;
  __m?: [number, number];
};

type DiffOptions = typeof options & {
  __b?: (vnode: IdVNode) => void;
};

const documentMask: [number, number] = [0, 0];
const diffOptions = options as DiffOptions;

// workaround(preact): useId counts per root and a portal's re-render starts a new root, so separate roots and updated portals repeat ids; every root shares one counter instead (seen with preact 10.29.2)
const previousDiff = diffOptions.__b;
diffOptions.__b = (vnode) => {
  if (vnode.__ == null) {
    vnode.__m = documentMask;
  }
  previousDiff?.(vnode);
};

// workaround(preact): an element vnode that bails out on strict equality takes its old twin's children without pointing them back at itself, so useId walks into a detached ancestor and restarts its counter (seen with preact 10.29.2)
const previousDiffed = options.diffed;
options.diffed = (vnode) => {
  previousDiffed?.(vnode);
  const node = vnode as IdVNode;
  if (typeof node.type !== "string" || !Array.isArray(node.__k)) {
    return;
  }
  for (const child of node.__k) {
    if (child && typeof child === "object" && child.__ !== node) {
      child.__ = node;
    }
  }
};
