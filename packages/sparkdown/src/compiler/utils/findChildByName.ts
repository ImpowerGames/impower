import { type SyntaxNode } from "@lezer/common";

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
