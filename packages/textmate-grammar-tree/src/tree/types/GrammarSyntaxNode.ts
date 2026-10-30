import { type SyntaxNode, type NodeType } from "@lezer/common";

export type GrammarSyntaxNode<N extends string, T extends N = N> = SyntaxNode & {
  name: T;
  type: NodeType & { name: N };
};
