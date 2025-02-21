import { type SparkdownNodeName } from "../../../../sparkdown/src/types/SparkdownNodeName";
import { type SyntaxNode } from "../../../../grammar-compiler/src/compiler/classes/Tree";
import { type SparkdownSyntaxNode } from "../../types/SparkdownSyntaxNode";

export const getDescendent = (
  descendentTypeName: SparkdownNodeName,
  parent: SyntaxNode
): SparkdownSyntaxNode | undefined => {
  if (parent) {
    const cur = parent?.node.cursor();
    while (cur.from <= parent.to) {
      if (cur.node.type.name === descendentTypeName) {
        return cur.node as SparkdownSyntaxNode;
      }
      cur?.next();
    }
  }
  return undefined;
};
