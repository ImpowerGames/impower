import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNode } from "../../types/SparkdownSyntaxNode";

export const getDescendentInsideParent = (
  descendentTypeName: SparkdownNodeName,
  parentTypeName: SparkdownNodeName,
  stack: SparkdownSyntaxNode[]
): SparkdownSyntaxNode | undefined => {
  const parent = stack.find((n) => n.type.name === parentTypeName);
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
