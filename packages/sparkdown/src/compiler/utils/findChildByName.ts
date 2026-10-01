import { type SyntaxNode } from "@lezer/common";

/**
 * The first direct child of `parent` named `name`, or null. It imports
 * nothing from the lowerers, so an annotator can use it too; the grammar
 * node-name check (`scripts/node-names.mjs`) checks the names passed to it.
 */
export function findChildByName(
  parent: SyntaxNode,
  name: string,
): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}
