import type { SyntaxNode, SyntaxNodeRef } from "@lezer/common";

const LINE_PIECE = "LuauInterpolatedStringExpression";

const LINE_BODIES = new Set([
  "ActionLineEnd_content",
  "BlockActionLineContinue_content",
  "BlockLineContinue_content",
  "LineEnd_content",
]);

const LINE_COMMENTS =new Set(["SparkdownBlockComment", "SparkdownBlockCommentOnLine"]);

const opensLine = (node: SyntaxNode) => node.name.endsWith("_begin") || LINE_COMMENTS.has(node.name);

const closesLine = (node: SyntaxNode) => node.name.endsWith("_end") || LINE_COMMENTS.has(node.name);

const startsWithPiecesOnly = (node: SyntaxNode): boolean => {
  for (let before = node.prevSibling; before; before = before.prevSibling) {
    if (before.name !== LINE_PIECE && !opensLine(before)) return false;
  }
  return true;
};

const endsLine = (node: SyntaxNode): boolean => {
  for (let after = node.nextSibling; after; after = after.nextSibling) {
    if (!closesLine(after)) return false;
  }
  return true;
};

const isLinePieceWords = (node: SyntaxNode): boolean =>
  LINE_BODIES.has(node.parent?.name ?? "") && endsLine(node) && startsWithPiecesOnly(node);

export const isLineWords = (node: SyntaxNodeRef): boolean =>
  node.name === "TextChunk" || (node.name === LINE_PIECE && isLinePieceWords(node.node));

export const printedLineStart = (node: SyntaxNode): number => {
  if (!LINE_BODIES.has(node.parent?.name ?? "") || !startsWithPiecesOnly(node)) return node.from;
  let start = node.from;
  for (let before = node.prevSibling; before; before = before.prevSibling) {
    if (before.name === LINE_PIECE) start = before.from;
  }
  return start;
};
