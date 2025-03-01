import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getOtherNodesInsideParent = <T extends string>(
  targetTypeName: T | T[],
  parentTypeName: T | T[],
  stack: GrammarSyntaxNode<T>[]
): GrammarSyntaxNode<T>[] => {
  const matches: GrammarSyntaxNode<T>[] = [];
  const current = stack[0];
  const target =
    stack.find((n) =>
      typeof targetTypeName === "string"
        ? n.name === targetTypeName
        : targetTypeName.includes(n.name as T)
    ) || stack.find((n) => n.name === stack[0]?.name);
  const parent = stack.find((n) =>
    typeof parentTypeName === "string"
      ? n.name === parentTypeName
      : parentTypeName.includes(n.name as T)
  );
  if (current && parent) {
    let prevSibling = target?.prevSibling;
    while (prevSibling) {
      if (
        typeof targetTypeName === "string"
          ? prevSibling.name === targetTypeName
          : targetTypeName.includes(prevSibling.name as T)
      ) {
        matches.unshift(prevSibling.node as GrammarSyntaxNode<T>);
      }
      prevSibling = prevSibling?.prevSibling;
    }
    let nextSibling = target?.nextSibling;
    while (nextSibling) {
      if (
        typeof targetTypeName === "string"
          ? nextSibling.name === targetTypeName
          : targetTypeName.includes(nextSibling.name as T)
      ) {
        matches.unshift(nextSibling.node as GrammarSyntaxNode<T>);
      }
      nextSibling = nextSibling?.nextSibling;
    }
  }
  return matches;
};
