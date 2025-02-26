import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";

export const getParentPropertyPath = <T extends string>(
  propertyNameNode: GrammarSyntaxNode<T>,
  read: (from: number, to: number) => string
): T[] => {
  let stackCursor: GrammarSyntaxNode<T> | null =
    propertyNameNode.node as GrammarSyntaxNode<T>;
  let path: string[] = [];
  while (stackCursor) {
    if (stackCursor.name === "StructObjectItemBlock") {
      path = ["0", ...path];
    }
    if (stackCursor.name === "StructObjectItemWithInlineScalarProperty") {
      path = ["0", ...path];
    }
    if (stackCursor.name === "StructObjectItemWithInlineObjectProperty") {
      path = ["0", ...path];
      const beginNode = stackCursor.getChild(
        "StructObjectItemWithInlineObjectProperty_begin"
      ) as GrammarSyntaxNode<T>;
      if (beginNode) {
        const nameNode = getDescendent(
          "DeclarationObjectPropertyName",
          beginNode
        );
        if (nameNode && nameNode.from !== propertyNameNode.from) {
          path = [read(nameNode.from, nameNode.to), ...path];
        }
      }
    }
    if (stackCursor.name === "StructObjectProperty") {
      const beginNode = stackCursor.getChild("StructObjectProperty_begin");
      if (beginNode) {
        const nameNode = getDescendent(
          "DeclarationObjectPropertyName",
          beginNode
        );
        if (nameNode && nameNode.from !== propertyNameNode.from) {
          path = [read(nameNode.from, nameNode.to), ...path];
        }
      }
    }
    stackCursor = stackCursor.node.parent as GrammarSyntaxNode<T>;
  }
  return path as T[];
};
