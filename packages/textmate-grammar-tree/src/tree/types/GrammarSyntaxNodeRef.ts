import { type NodeType, type SyntaxNodeRef } from "@lezer/common";

/**
 * A lezer node reference whose names are drawn from a grammar's node-name
 * union `N`; see `GrammarSyntaxNode` for the `N`/`T` split.
 */
export type GrammarSyntaxNodeRef<N extends string, T extends N = N> = SyntaxNodeRef & {
  name: T;
  type: NodeType & { name: N };
};
