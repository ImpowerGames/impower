import { type Tree, type TreeCursor } from "@lezer/common";
import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getOtherMatchesInsideParent = <T extends string>(
  matchTypeName: T | T[],
  parentTypeName: T | T[],
  stack: GrammarSyntaxNode<T>[],
  tree: Tree,
  read: (from: number, to: number) => string,
): string[] => {
  const matches: string[] = [];
  const current = stack[0];

  // 1. Find the target parent node in the stack
  const parent = stack.find((n) =>
    typeof parentTypeName === "string"
      ? n.name === parentTypeName
      : parentTypeName.includes(n.name as T),
  );

  if (!current || !parent) return matches;

  const isMatch = (name: string): boolean => {
    return typeof matchTypeName === "string"
      ? name === matchTypeName
      : matchTypeName.includes(name as T);
  };

  // 2. Search Backwards (Siblings before "current")
  // We start at 'current' and move through previous siblings until we hit the parent boundary
  let prevCursor: TreeCursor = tree.cursorAt(current.from);

  // Move to the previous sibling at the same level as 'current'
  while (prevCursor.prevSibling()) {
    // If the sibling starts before the parent, we've gone too far (sanity check)
    if (prevCursor.from < parent.from) break;

    if (isMatch(prevCursor.name)) {
      matches.unshift(read(prevCursor.from, prevCursor.to));
    }
  }

  // 3. Search Forwards (Siblings after "current")
  let nextCursor: TreeCursor = tree.cursorAt(current.from);

  // Move to the next sibling at the same level as 'current'
  while (nextCursor.nextSibling()) {
    // If the sibling ends after the parent, we stop
    if (nextCursor.to > parent.to) break;

    if (isMatch(nextCursor.name)) {
      matches.push(read(nextCursor.from, nextCursor.to));
    }
  }

  return matches;
};
