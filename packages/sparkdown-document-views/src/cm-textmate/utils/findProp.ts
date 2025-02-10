import { NodeProp, Tree } from "@lezer/common";

/**
 * Returns the first chunk buffer found within a tree, if any.
 *
 * @param tree - The tree to search through, recursively.
 * @param from - The start of the search area.
 * @param to - The end of the search area.
 * @param offset - An offset added to the tree's positions, so that they
 *   may match some other source's positions.
 */
export const findProp = <T>(
  prop: NodeProp<T>,
  tree: Tree,
  from: number,
  to: number,
  offset = 0
): T | null => {
  const bundle: T | undefined =
    offset >= from && offset + tree.length >= to ? tree.prop(prop) : undefined;

  if (bundle) {
    return bundle;
  }

  // recursively check children
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
