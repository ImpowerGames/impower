import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getDescendentsInsideParent = <T extends string>(
  descendentTypeName: T,
  parentTypeName: T,
  stack: GrammarSyntaxNode<T>[]
): GrammarSyntaxNode<T>[] => {
  const parent = stack.find((n) => n.name === parentTypeName);
  const result: GrammarSyntaxNode<T>[] = [];
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (cur.name === descendentTypeName) {
        result.push(cur.node as GrammarSyntaxNode<T>);
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return result;
};
