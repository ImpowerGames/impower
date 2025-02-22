import { type Tree, type NodeIterator } from "../classes/Tree";
import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getStack = <T extends string>(
  tree: Tree,
  offset: number
): GrammarSyntaxNode<T>[] => {
  const side = -1;
  const stackIterator = tree.resolveStack(offset, side);
  const stack = [] as GrammarSyntaxNode<T>[];
  for (let cur: NodeIterator | null = stackIterator; cur; cur = cur.next) {
    stack.push(cur.node as GrammarSyntaxNode<T>);
  }
  return stack;
};
