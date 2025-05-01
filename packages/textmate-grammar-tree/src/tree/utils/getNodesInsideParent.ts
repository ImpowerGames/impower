import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getNodesInsideParent = <T extends string>(
  targetTypeName: T | T[],
  parentTypeName: T | T[],
  stack: GrammarSyntaxNode<T>[]
): GrammarSyntaxNode<T>[] => {
  const matches: GrammarSyntaxNode<T>[] = [];
  const parent = stack.find((n) =>
    typeof parentTypeName === "string"
      ? n.name === parentTypeName
      : parentTypeName.includes(n.name as T)
  );
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (
        typeof targetTypeName === "string"
          ? targetTypeName === cur.name
          : targetTypeName.includes(cur.name as T)
      ) {
        matches.push(cur.node as GrammarSyntaxNode<T>);
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return matches;
};
