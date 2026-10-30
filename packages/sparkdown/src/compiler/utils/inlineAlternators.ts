import type { SyntaxNode } from "@lezer/common";
import { opensAlternator } from "./alternatorDecision";
import type { SparkdownNodeName } from "../types/SparkdownNodeName";
import { nodeNameSet } from "./nodeNameSet";

const PRESERVE_WHITESPACE_ALTERNATOR_NAME_LIST: SparkdownNodeName[] = [
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
];
export const PRESERVE_WHITESPACE_ALTERNATOR_NAMES = nodeNameSet(
  PRESERVE_WHITESPACE_ALTERNATOR_NAME_LIST,
);

export const ALL_INLINE_ALTERNATOR_NAMES = nodeNameSet([
  ...PRESERVE_WHITESPACE_ALTERNATOR_NAME_LIST,
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorBlock",
]);

export function isInsideOneLineAlternator(
  node: SyntaxNode,
  read: (from: number, to: number) => string,
  names: Set<string>,
): boolean {
  for (let ancestor: SyntaxNode | null = node; ancestor; ancestor = ancestor.parent) {
    if (!names.has(ancestor.name) || !opensAlternator(ancestor)) continue;
    const span = read(ancestor.from, ancestor.to);
    if (span.includes("\n")) continue;
    return true;
  }
  return false;
}
