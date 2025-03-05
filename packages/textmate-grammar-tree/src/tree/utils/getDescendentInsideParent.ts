import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getDescendentInsideParent = <T extends string>(
  descendentTypeName: T | T[],
  parentTypeName: T | T[],
  stack: GrammarSyntaxNode<T>[]
): GrammarSyntaxNode<T> | undefined => {
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
          return cur.node as GrammarSyntaxNode<T>;
        }
        if (!cur?.next()) {
          break;
        }
      }
    }
  }
  return undefined;
};
