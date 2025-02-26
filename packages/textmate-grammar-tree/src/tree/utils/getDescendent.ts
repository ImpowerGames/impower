import { type SyntaxNode } from "@lezer/common";
import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

export const getDescendent = <T extends string>(
  descendentTypeName: T | T[],
  parent: SyntaxNode
): GrammarSyntaxNode<T> | undefined => {
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (
        typeof descendentTypeName === "string"
          ? cur.name === descendentTypeName
          : descendentTypeName.includes(cur.name as T)
      ) {
        return cur.node as GrammarSyntaxNode<T>;
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return undefined;
};
