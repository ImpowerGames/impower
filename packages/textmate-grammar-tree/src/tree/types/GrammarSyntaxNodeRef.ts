import { type NodeType, type SyntaxNodeRef } from "@lezer/common";

export type GrammarSyntaxNodeRef<N extends string, T extends N = N> = SyntaxNodeRef & {
  name: T;
  type: NodeType & { name: N };
};
