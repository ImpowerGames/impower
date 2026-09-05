import { type GrammarSyntaxNode } from "../types/GrammarSyntaxNode";

/**
 * `N` is the grammar's node-name union, inferred from `parent`; `T` is the
 * name (or names) being looked up and must belong to it. A parent typed
 * `GrammarSyntaxNode<SparkdownNodeName>` therefore turns a lookup of a name
 * the grammar does not have into a compile error. A bare lezer `SyntaxNode`
 * parent infers `N` as `string` and checks nothing, so type the parent where
 * the check matters.
 */
export const getDescendent = <N extends string, T extends N = N>(
  descendentTypeName: T | T[],
  parent: GrammarSyntaxNode<N>,
): GrammarSyntaxNode<N, T> | undefined => {
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (
        typeof descendentTypeName === "string"
          ? cur.name === descendentTypeName
          : descendentTypeName.includes(cur.name as T)
      ) {
        return cur.node as GrammarSyntaxNode<N, T>;
      }
      if (!cur?.next()) {
        break;
      }
    }
  }
  return undefined;
};
