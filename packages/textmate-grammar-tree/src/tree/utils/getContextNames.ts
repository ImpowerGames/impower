import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getContextNames = <T extends string>(
  node: GrammarSyntaxNode<T>
): T[] => {
  const context: T[] = [];
  let parent = node.parent;
  while (parent) {
    context.push(parent.name as T);
    parent = parent.parent;
  }
  return context;
};
