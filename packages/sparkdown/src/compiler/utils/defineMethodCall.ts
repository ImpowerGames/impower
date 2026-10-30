import type { SyntaxNode } from "@lezer/common";
import { isTrivia } from "../lint/luauTree";

function holdsEndKeyword(node: SyntaxNode): boolean {
  const cursor = node.cursor();
  while (cursor.next() && cursor.from < node.to) {
    if (cursor.name === "LuauEndKeyword") return true;
  }
  return false;
}

export function isDefineMethodCall(node: SyntaxNode, lineOf: (pos: number) => number): boolean {
  if (node.name !== "LuauMethodDefinition") return false;
  const end = node.getChild("LuauMethodDefinition_end");
  if (end && holdsEndKeyword(end)) return false;
  const content = node.getChild("LuauMethodDefinition_content");
  if (!content) return true;
  const headerLine = lineOf(node.from);
  const holdsLaterToken = (n: SyntaxNode): boolean => {
    if (!n.firstChild) return !isTrivia(n) && lineOf(n.from) > headerLine;
    for (let child: SyntaxNode | null = n.firstChild; child; child = child.nextSibling) {
      if (holdsLaterToken(child)) return true;
    }
    return false;
  };
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (!HEADER_PARTS.has(child.name) && holdsLaterToken(child)) return false;
  }
  return true;
}

const HEADER_PARTS: ReadonlySet<string> = new Set([
  "LuauFunctionParameters",
  "LuauFunctionReturnType",
  "LuauFunctionReturnMissingType",
]);
