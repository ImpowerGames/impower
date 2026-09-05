import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

/**
 * `N` is the grammar's node-name union, inferred from `stack`; the looked-up
 * names `T` and `P` must belong to it. See `getDescendent`.
 */
export const getDescendentsInsideParent = <
  N extends string,
  T extends N = N,
  P extends N = N,
>(
  descendentTypeName: T,
  parentTypeName: P,
  stack: GrammarSyntaxNode<N>[],
): GrammarSyntaxNode<N, T>[] => {
  const parent = stack.find((n) => n.name === parentTypeName);
  const result: GrammarSyntaxNode<N, T>[] = [];
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (cur.name === descendentTypeName) {
        result.push(cur.node as GrammarSyntaxNode<N, T>);
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return result;
};
