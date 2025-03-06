import { type NodeType, type SyntaxNodeRef } from "@lezer/common";

export type GrammarSyntaxNodeRef<T extends string> = SyntaxNodeRef & {
  name: T;
  type: NodeType & { name: T };
};
