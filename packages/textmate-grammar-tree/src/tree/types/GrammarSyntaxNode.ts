import { type SyntaxNode, type NodeType } from "@lezer/common";

export type GrammarSyntaxNode<T extends string> = SyntaxNode & {
  name: T;
  type: NodeType & { name: T };
};
