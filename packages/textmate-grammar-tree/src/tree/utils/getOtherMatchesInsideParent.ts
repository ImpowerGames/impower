import { type Tree } from "@lezer/common";
import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getOtherMatchesInsideParent = <T extends string>(
  matchTypeName: T,
  parentTypeName: T,
  stack: GrammarSyntaxNode<T>[],
  tree: Tree,
  read: (from: number, to: number) => string
): string[] => {
  const side = -1;
  const matches = [];
  const current = stack[0];
  const parent = stack.find((n) => n.name === parentTypeName);
  if (current && parent) {
    const prevCur = tree.cursorAt(current.from - 1, side);
    while (prevCur.from >= parent.from) {
      const node = prevCur.node;
      if (node.name === matchTypeName) {
        matches.unshift(read(node.from, node.to));
      }
      prevCur.moveTo(prevCur.from - 1, side);
    }
    const nextCur = tree.cursorAt(current.to + 1, side);
    while (nextCur.to <= parent.to) {
      const node = nextCur.node;
      if (node.name === matchTypeName) {
        matches.push(read(node.from, node.to));
      }
      nextCur.moveTo(nextCur.to + 1, side);
    }
  }
  return matches;
};
