import type { SyntaxNode } from "@lezer/common";

const LEADING_LINE_PIECE = "LuauInterpolatedStringExpression";

export const firstLeadingPiece = (node: SyntaxNode): SyntaxNode | undefined => {
  let first: SyntaxNode | undefined;
  for (let before = node.prevSibling; before; before = before.prevSibling) {
    if (before.name === LEADING_LINE_PIECE) first = before;
    else if (!before.name.endsWith("_begin")) return undefined;
  }
  return first;
};

export const printedLineStart = (node: SyntaxNode): number => firstLeadingPiece(node)?.from ?? node.from;
