import type { SyntaxNode, Tree } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

const STORY_COMMENTS = nodeNameSet([
  "SparkdownLineComment",
  "SparkdownInlineComment",
  "SparkdownBlockComment",
]);

const commentAt = (tree: Tree, pos: number): SyntaxNode | null => {
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (STORY_COMMENTS.has(n.name) && n.from <= pos && pos < n.to) return n;
  }
  return null;
};

export const isCommentOnlyLine = (
  tree: Tree,
  lineFrom: number,
  lineText: string,
): boolean => {
  let i = lineText.search(/\S/);
  if (i < 0) return false;
  while (i < lineText.length) {
    const comment = commentAt(tree, lineFrom + i);
    if (!comment) return false;
    i = comment.to - lineFrom;
    while (i < lineText.length && /\s/.test(lineText[i]!)) i++;
  }
  return true;
};
