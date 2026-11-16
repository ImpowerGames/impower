import type { Tree } from "@lezer/common";
import { isCommentOnlyLine } from "./isCommentOnlyLine";
import { nodeNameSet } from "./nodeNameSet";

const DIALOGUE_CUE = /^[^:]+:$/;

const END_KEYWORDS = nodeNameSet(["LuauEndKeyword"]);

const isBlockEndLine = (tree: Tree, lineFrom: number, lineText: string) => {
  const keyword = tree.resolveInner(lineFrom + lineText.search(/\S/), 1);
  if (!END_KEYWORDS.has(keyword.name)) {
    return false;
  }
  const rest = lineText.slice(keyword.to - lineFrom);
  return !rest.trim() || isCommentOnlyLine(tree, keyword.to, rest);
};

export const isExecutionGapLine = (
  tree: () => Tree | undefined,
  lineFrom: number,
  lineText: string,
): boolean => {
  const trimmedText = lineText.trim();
  if (!trimmedText || DIALOGUE_CUE.test(trimmedText)) {
    return true;
  }
  const parsed = tree();
  return (
    !!parsed &&
    (isCommentOnlyLine(parsed, lineFrom, lineText) ||
      isBlockEndLine(parsed, lineFrom, lineText))
  );
};
