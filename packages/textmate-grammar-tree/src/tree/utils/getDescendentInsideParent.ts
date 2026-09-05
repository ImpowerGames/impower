import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

/**
 * `N` is the grammar's node-name union, inferred from `stack`; the looked-up
 * names `T` and `P` must belong to it. See `getDescendent`.
 */
export const getDescendentInsideParent = <
  N extends string,
  T extends N = N,
  P extends N = N,
>(
  descendentTypeName: T | T[],
  parentTypeName: P | P[],
  stack: GrammarSyntaxNode<N>[],
): GrammarSyntaxNode<N, T> | undefined => {
  const parentTypeNameArray =
    typeof parentTypeName === "string" ? [parentTypeName] : parentTypeName;
  for (const parentName of parentTypeNameArray) {
    const parent = stack.find((n) => n.name === parentName);
    if (parent) {
      const cur = parent?.node.cursor();
      while (cur.from <= parent.to) {
        if (
          typeof descendentTypeName === "string"
            ? descendentTypeName === cur.name
            : descendentTypeName.includes(cur.name as T)
        ) {
          return cur.node as GrammarSyntaxNode<N, T>;
        }
        if (!cur?.next()) {
          break;
        }
      }
    }
  }
  return undefined;
};
