import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getDescendentInsideParent = <T extends string>(
  descendentTypeName: T,
  parentTypeName: T,
  stack: GrammarSyntaxNode<T>[]
): GrammarSyntaxNode<T> | undefined => {
  const parent = stack.find((n) => n.name === parentTypeName);
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (cur.name === descendentTypeName) {
        return cur.node as GrammarSyntaxNode<T>;
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return undefined;
};
