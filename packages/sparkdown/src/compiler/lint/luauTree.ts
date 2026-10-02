// Reading the syntax tree for the annotators: whether a node is trivia, and
// the name an access path holds when it is one bare name. The Luau lints read
// the Luau AST instead (`collectLuauLints.ts`).

import { type SyntaxNode } from "@lezer/common";

function* childrenOf(node: SyntaxNode | null | undefined) {
  for (let c = node?.firstChild; c; c = c.nextSibling) {
    yield c;
  }
}

function contentOf(node: SyntaxNode | null | undefined) {
  if (!node) return null;
  for (const c of childrenOf(node)) {
    if (c.name === `${node.name}_content`) return c;
  }
  return null;
}

export function isTrivia(node: SyntaxNode) {
  return (
    node.from === node.to ||
    node.name === "Newline" ||
    node.name.endsWith("Whitespace") ||
    node.name.includes("Comment") ||
    node.name.endsWith("_begin") ||
    node.name.endsWith("_end")
  );
}

/** The `LuauVariableName` of an access path that is one bare name. */
export function soleVariableName(path: SyntaxNode): SyntaxNode | null {
  const parts = [...childrenOf(contentOf(path))].filter((c) => !isTrivia(c));
  if (parts.length !== 1 || parts[0]!.name !== "LuauAccessPart") return null;
  const inPart = [...childrenOf(parts[0])].filter((c) => !isTrivia(c));
  if (inPart.length !== 1 || inPart[0]!.name !== "LuauVariable") return null;
  const token = inPart[0]!.firstChild?.firstChild;
  return token?.name === "LuauVariableName" ? token : null;
}

