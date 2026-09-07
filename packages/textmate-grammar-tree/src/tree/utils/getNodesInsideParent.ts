import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

/**
 * `N` is the grammar's node-name union, inferred from `stack`; the looked-up
 * names `T` and `P` must belong to it. See `getDescendent`.
 */
export const getNodesInsideParent = <
  N extends string,
  T extends N = N,
  P extends N = N,
>(
  targetTypeName: T | T[],
  parentTypeName: P | P[],
  stack: GrammarSyntaxNode<N>[],
): GrammarSyntaxNode<N, T>[] => {
  const matches: GrammarSyntaxNode<N, T>[] = [];
  const parent = stack.find((n) =>
    typeof parentTypeName === "string"
      ? n.name === parentTypeName
      : parentTypeName.includes(n.name as P),
  );
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (
        typeof targetTypeName === "string"
          ? targetTypeName === cur.name
          : targetTypeName.includes(cur.name as T)
      ) {
        matches.push(cur.node as GrammarSyntaxNode<N, T>);
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return matches;
};
