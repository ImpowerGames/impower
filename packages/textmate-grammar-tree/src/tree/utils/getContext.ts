import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getContext = <T extends string>(
  node: GrammarSyntaxNode<T>
): T[] => {
  const context: T[] = [];
  let parent = node.parent;
  while (parent) {
    context.unshift(parent.name as T);
    parent = parent.parent;
  }
  return context;
};
