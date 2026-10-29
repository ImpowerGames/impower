import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getDescendents = <N extends string, T extends N = N>(
  descendentTypeName: T | T[],
  parent: GrammarSyntaxNode<N>,
): GrammarSyntaxNode<N, T>[] => {
  const descendents = [];
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (
        typeof descendentTypeName === "string"
          ? cur.name === descendentTypeName
          : descendentTypeName.includes(cur.name as T)
      ) {
        descendents.push(cur.node as GrammarSyntaxNode<N, T>);
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return descendents;
};
