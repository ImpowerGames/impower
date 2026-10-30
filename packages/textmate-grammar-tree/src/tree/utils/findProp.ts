import { NodeProp, Tree } from "@lezer/common";

export const findProp = <T>(
  prop: NodeProp<T>,
  tree: Tree,
  from: number,
  to: number,
  offset = 0,
): T | null => {
  const bundle: T | undefined =
    offset >= from && offset + tree.length >= to ? tree.prop(prop) : undefined;

  if (bundle) {
    return bundle;
  }

  for (let i = tree.children.length - 1; i >= 0; i--) {
    const child = tree.children[i];
    const pos = offset + tree.positions[i]!;
    if (!(child instanceof Tree && pos < to)) {
      continue;
    }
    const found = findProp(prop, child, from, to, pos);
    if (found) {
      return found;
    }
  }

  return null;
};
