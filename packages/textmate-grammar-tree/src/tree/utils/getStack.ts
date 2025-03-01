import { type Tree, type NodeIterator } from "@lezer/common";
import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getStack = <T extends string>(
  tree: Tree,
  offset: number,
  side: 0 | 1 | -1 | undefined = -1
): GrammarSyntaxNode<T>[] => {
  const stackIterator = tree.resolveStack(offset, side);
  const stack = [] as GrammarSyntaxNode<T>[];
  for (let cur: NodeIterator | null = stackIterator; cur; cur = cur.next) {
    stack.push(cur.node as GrammarSyntaxNode<T>);
  }
  return stack;
};
