// The leaves of the grammar's `LuauUnreadToken`: a token no rule of a
// pure-Luau body or bracket read, which the converter reads as Luau's lexer
// does (`readLuauAst.ts`).

import type { SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

export const UNREAD_TOKENS: ReadonlySet<string> = nodeNameSet(["LuauUnreadName", "LuauUnreadCharacter"]);

/** Whether the token at a document offset, looked up from any node of its tree, is one the grammar left unread. */
export function isUnreadTokenAt(anyNode: SyntaxNode, offset: number): boolean {
  let root = anyNode;
  while (root.parent) root = root.parent;
  return UNREAD_TOKENS.has(root.resolveInner(offset, 1).name);
}

/** Whether a node is, or holds at any depth, a token the grammar left unread. */
export function containsUnreadToken(node: SyntaxNode): boolean {
  if (UNREAD_TOKENS.has(node.name)) return true;
  const cursor = node.cursor();
  if (!cursor.firstChild()) return false;
  do {
    if (UNREAD_TOKENS.has(cursor.name)) return true;
  } while (cursor.next() && cursor.from < node.to);
  return false;
}
