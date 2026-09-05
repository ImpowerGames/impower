import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

/**
 * `N` is the grammar's node-name union, inferred from `stack`; the looked-up
 * names `T` and `P` must belong to it. See `getDescendent`.
 */
export const getOtherNodesInsideParent = <
  N extends string,
  T extends N = N,
  P extends N = N,
>(
  targetTypeName: T | T[],
  parentTypeName: P | P[],
  stack: GrammarSyntaxNode<N>[],
  direction: "both" | "behind" | "ahead" = "both",
): GrammarSyntaxNode<N, T>[] => {
  const matches: GrammarSyntaxNode<N, T>[] = [];
  const current = stack[0];
  const target =
    stack.find((n) =>
      typeof targetTypeName === "string"
        ? n.name === targetTypeName
        : targetTypeName.includes(n.name as T),
    ) || stack.find((n) => n.name === stack[0]?.name);
  const parent = stack.find((n) =>
    typeof parentTypeName === "string"
      ? n.name === parentTypeName
      : parentTypeName.includes(n.name as P),
  );
  if (current && parent) {
    if (direction === "both" || direction === "behind") {
      let prevSibling = target?.prevSibling;
      while (prevSibling) {
        if (
          typeof targetTypeName === "string"
            ? prevSibling.name === targetTypeName
            : targetTypeName.includes(prevSibling.name as T)
        ) {
          matches.unshift(prevSibling.node as GrammarSyntaxNode<N, T>);
        }
        prevSibling = prevSibling?.prevSibling;
      }
    }
    if (direction === "both" || direction === "ahead") {
      let nextSibling = target?.nextSibling;
      while (nextSibling) {
        if (
          typeof targetTypeName === "string"
            ? nextSibling.name === targetTypeName
            : targetTypeName.includes(nextSibling.name as T)
        ) {
          matches.unshift(nextSibling.node as GrammarSyntaxNode<N, T>);
        }
        nextSibling = nextSibling?.nextSibling;
      }
    }
  }
  return matches;
};
