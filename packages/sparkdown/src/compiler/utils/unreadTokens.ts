import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

export const UNREAD_TOKENS: ReadonlySet<string> = nodeNameSet(["LuauUnreadName", "LuauUnreadCharacter", "LuauStrayCloser", "LuauTypeIntersectionLineOperator"]);

export function isUnreadTokenAt(anyNode: SyntaxNode, offset: number): boolean {
  let root = anyNode;
  while (root.parent) root = root.parent;
  return UNREAD_TOKENS.has(root.resolveInner(offset, 1).name);
}

export function containsUnreadToken(node: SyntaxNode): boolean {
  if (UNREAD_TOKENS.has(node.name)) return true;
  const cursor = node.cursor();
  if (!cursor.firstChild()) return false;
  do {
    if (UNREAD_TOKENS.has(cursor.name)) return true;
  } while (cursor.next() && cursor.from < node.to);
  return false;
}
