import { type SyntaxNode } from "@lezer/common";
import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getDescendents = <T extends string>(
  descendentTypeName: T | T[],
  parent: SyntaxNode
): GrammarSyntaxNode<T>[] => {
  const descendents = [];
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (
        typeof descendentTypeName === "string"
          ? cur.name === descendentTypeName
          : descendentTypeName.includes(cur.name as T)
      ) {
        descendents.push(cur.node as GrammarSyntaxNode<T>);
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return descendents;
};
