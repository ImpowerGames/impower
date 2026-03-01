import { type GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";

export const getParentPropertyPath = <T extends string>(
  propertyNameNode: GrammarSyntaxNode<T>,
  read: (from: number, to: number) => string,
): T[] => {
  let stackCursor: GrammarSyntaxNode<T> | null =
    propertyNameNode.node as GrammarSyntaxNode<T>;
  let path: string[] = [];
  while (stackCursor) {
    if (
      stackCursor.name === "ViewStructObjectItemBlock" ||
      stackCursor.name === "StylingStructObjectItemBlock" ||
      stackCursor.name === "PlainStructObjectItemBlock"
    ) {
      path = ["0", ...path];
    }
    if (
      stackCursor.name === "ViewStructObjectItemWithInlineScalarProperty" ||
      stackCursor.name === "StylingStructObjectItemWithInlineScalarProperty" ||
      stackCursor.name === "PlainStructObjectItemWithInlineScalarProperty"
    ) {
      path = ["0", ...path];
    }
    if (
      stackCursor.name === "ViewStructObjectItemWithInlineObjectProperty" ||
      stackCursor.name === "StylingStructObjectItemWithInlineObjectProperty" ||
      stackCursor.name === "PlainStructObjectItemWithInlineObjectProperty"
    ) {
      path = ["0", ...path];
      const beginNode =
        stackCursor.getChild(
          "ViewStructObjectItemWithInlineObjectProperty_begin",
        ) ||
        stackCursor.getChild(
          "StylingStructObjectItemWithInlineObjectProperty_begin",
        ) ||
        (stackCursor.getChild(
          "PlainStructObjectItemWithInlineObjectProperty_begin",
        ) as GrammarSyntaxNode<T>);
      if (beginNode) {
        const nameNode = getDescendent(
          [
            "ViewDeclarationObjectPropertyName",
            "StylingDeclarationObjectPropertyName",
            "PlainDeclarationObjectPropertyName",
          ],
          beginNode,
        );
        if (nameNode && nameNode.from !== propertyNameNode.from) {
          path = [read(nameNode.from, nameNode.to), ...path];
        }
      }
    }
    if (
      stackCursor.name === "ViewStructObjectProperty" ||
      stackCursor.name === "StylingStructObjectProperty" ||
      stackCursor.name === "PlainStructObjectProperty"
    ) {
      const beginNode =
        stackCursor.getChild("ViewStructObjectProperty_begin") ||
        stackCursor.getChild("StylingStructObjectProperty_begin") ||
        stackCursor.getChild("PlainStructObjectProperty_begin");
      if (beginNode) {
        const nameNode = getDescendent(
          [
            "ViewDeclarationObjectPropertyName",
            "StylingDeclarationObjectPropertyName",
            "PlainDeclarationObjectPropertyName",
          ],
          beginNode,
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
