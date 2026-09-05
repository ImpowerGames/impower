import { type SyntaxNode, type NodeType } from "@lezer/common";

/**
 * A lezer node whose names are drawn from a grammar's node-name union `N`.
 *
 * `T` is the node's own name, narrowed by a lookup helper to the name it
 * searched for, while `type.name` keeps the full union. Carrying the union on
 * `type.name` is what lets a narrowed node serve as the parent of another
 * lookup: the helper infers `N` from `type.name`, so a name that the grammar
 * does not have is still rejected there.
 */
export type GrammarSyntaxNode<N extends string, T extends N = N> = SyntaxNode & {
  name: T;
  type: NodeType & { name: N };
};
