import type { Tree } from "../../../../grammar-compiler/src/compiler/classes/Tree";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNode } from "../../types/SparkdownSyntaxNode";

export const getOtherMatchesInsideParent = (
  matchTypeName: SparkdownNodeName,
  parentTypeName: SparkdownNodeName,
  stack: SparkdownSyntaxNode[],
  tree: Tree,
  read: (from: number, to: number) => string
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
        matches.unshift(read(node.from, node.to));
      }
      prevCur.moveTo(prevCur.from - 1, side);
    }
    const nextCur = tree.cursorAt(current.to + 1, side);
    while (nextCur.to <= parent.to) {
      const node = nextCur.node;
      if (node.type.name === matchTypeName) {
        matches.push(read(node.from, node.to));
      }
      nextCur.moveTo(nextCur.to + 1, side);
    }
  }
  return matches;
};
