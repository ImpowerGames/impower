import type { SyntaxNode } from "../../../../grammar-compiler/src/compiler/classes/Tree";
import type { SparkdownSyntaxNode } from "../../types/SparkdownSyntaxNode";
import { getDescendent } from "./getDescendent";

export const getParentPropertyPath = (
  propertyNameNode: SyntaxNode,
  read: (from: number, to: number) => string
) => {
  let stackCursor: SyntaxNode | null = propertyNameNode.node;
  let path = "";
  while (stackCursor) {
    if (stackCursor.type.name === "StructObjectItemBlock") {
      path = "0" + "." + path;
    }
    if (stackCursor.type.name === "StructObjectItemWithInlineScalarProperty") {
      path = "0" + "." + path;
    }
    if (stackCursor.type.name === "StructObjectItemWithInlineObjectProperty") {
      path = "0" + "." + path;
      const beginNode = stackCursor.getChild(
        "StructObjectItemWithInlineObjectProperty_begin"
      ) as SparkdownSyntaxNode;
      if (beginNode) {
        const nameNode = getDescendent(
          "DeclarationObjectPropertyName",
          beginNode
        );
        if (nameNode && nameNode.from !== propertyNameNode.from) {
          path = read(nameNode.from, nameNode.to) + "." + path;
        }
      }
    }
    if (stackCursor.type.name === "StructObjectProperty") {
      const beginNode = stackCursor.getChild("StructObjectProperty_begin");
      if (beginNode) {
        const nameNode = getDescendent(
          "DeclarationObjectPropertyName",
          beginNode
        );
        if (nameNode && nameNode.from !== propertyNameNode.from) {
          path = read(nameNode.from, nameNode.to) + "." + path;
        }
      }
    }
    stackCursor = stackCursor.node.parent;
  }
  return path;
};
