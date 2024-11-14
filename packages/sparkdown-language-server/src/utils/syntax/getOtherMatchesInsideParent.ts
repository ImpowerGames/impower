import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Tree } from "../../../../grammar-compiler/src/compiler/classes/Tree";
import type { SparkdownNodeName } from "../../../../sparkdown/src/types/SparkdownNodeName";
import type { SparkdownSyntaxNode } from "../../types/SparkdownSyntaxNode";
import { getNodeText } from "./getNodeText";

export const getOtherMatchesInsideParent = (
  matchTypeName: SparkdownNodeName,
  parentTypeName: SparkdownNodeName,
  stack: SparkdownSyntaxNode[],
  document: TextDocument,
  tree: Tree
): string[] => {
  const side = -1;
  const matches = [];
  const current = stack[0];
  const parent = stack.find((n) => n.type.name === parentTypeName);
  if (current && parent) {
    const prevCur = tree.cursorAt(current.from - 1, side);
    while (prevCur.from >= parent.from) {
      const node = prevCur.node;
      if (node.type.name === matchTypeName) {
        matches.unshift(getNodeText(node, document));
      }
      prevCur.moveTo(prevCur.from - 1, side);
    }
    const nextCur = tree.cursorAt(current.to + 1, side);
    while (nextCur.to <= parent.to) {
      const node = nextCur.node;
      if (node.type.name === matchTypeName) {
        matches.push(getNodeText(node, document));
      }
      nextCur.moveTo(nextCur.to + 1, side);
    }
  }
  return matches;
};
