import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getContextStack = <T extends string>(
  node: GrammarSyntaxNode<T>
): GrammarSyntaxNode<T>[] => {
  const context: GrammarSyntaxNode<T>[] = [];
  let parent = node.parent;
  while (parent) {
    context.push(parent as GrammarSyntaxNode<T>);
    parent = parent.parent;
  }
  return context;
};
