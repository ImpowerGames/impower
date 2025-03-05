import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getDescendentInsideParent = <T extends string>(
  descendentTypeName: T,
  parentTypeName: T | T[],
  stack: GrammarSyntaxNode<T>[]
): GrammarSyntaxNode<T> | undefined => {
  const parent = stack.find((n) =>
    typeof parentTypeName === "string"
      ? n.name === parentTypeName
      : parentTypeName.includes(n.name)
  );
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
