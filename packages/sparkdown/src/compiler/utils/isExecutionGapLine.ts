import type { SyntaxNode, Tree } from "@lezer/common";
import { nodeNameSet } from "./nodeNameSet";

const DIALOGUE_CUE = /^[^:]+:$/;

const END_KEYWORDS = nodeNameSet(["LuauEndKeyword"]);

const COMMENTS = nodeNameSet([
  "SparkdownLineComment",
  "SparkdownInlineComment",
  "SparkdownBlockComment",
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
]);

const OPTIONS = nodeNameSet(["Choice"]);

const isOptionAt = (tree: Tree, pos: number): boolean => {
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (OPTIONS.has(n.name)) return true;
  }
  return false;
};

const commentEndAt =(tree: Tree, pos: number): number | null => {
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (COMMENTS.has(n.name) && n.from <= pos && pos < n.to) return n.to;
  }
  return null;
};

const holdsOnlyComments = (
  tree: Tree,
  lineFrom: number,
  lineText: string,
  from: number,
): boolean => {
  let i = from;
  for (;;) {
    while (i < lineText.length && /\s/.test(lineText[i]!)) i++;
    if (i >= lineText.length) return true;
    const end = commentEndAt(tree, lineFrom + i);
    if (end === null) return false;
    i = end - lineFrom;
  }
};

export const isExecutionGapLine = (
  tree: () => Tree | undefined,
  lineFrom: number,
  lineText: string,
): boolean => {
  const trimmedText = lineText.trim();
  if (!trimmedText) {
    return true;
  }
  const parsed = tree();
  const start = lineText.search(/\S/);
  if (DIALOGUE_CUE.test(trimmedText)) {
    return !parsed || !isOptionAt(parsed, lineFrom + start);
  }
  if (!parsed) {
    return false;
  }
  const first = parsed.resolveInner(lineFrom + start, 1);
  const rest = END_KEYWORDS.has(first.name) ? first.to - lineFrom : start;
  return holdsOnlyComments(parsed, lineFrom, lineText, rest);
};
