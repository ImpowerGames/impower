import { Position } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";
import { Tree } from "@lezer/common";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";

export const getSymbol = (
  document: TextDocument | undefined,
  tree: Tree | undefined,
  position: Position
): GrammarSyntaxNode<SparkdownNodeName> | null | undefined => {
  if (!document || !tree) {
    return undefined;
  }
  const leftStack = getStack<SparkdownNodeName>(
    tree,
    document.offsetAt(position),
    -1
  );
  const renamableNode = leftStack.find(
    (n) =>
      n.name === "FunctionDeclarationName" ||
      n.name === "KnotDeclarationName" ||
      n.name === "StitchDeclarationName" ||
      n.name === "LabelDeclarationName" ||
      n.name === "DefineTypeName" ||
      n.name === "DefineVariableName" ||
      n.name === "DeclarationScalarPropertyName" ||
      n.name === "PropertySelectorClassName" ||
      n.name === "TypeName" ||
      n.name === "VariableName" ||
      n.name === "PropertyName" ||
      n.name === "FunctionName" ||
      n.name === "DivertPartName" ||
      n.name === "DialogueCharacterName" ||
      n.name === "AssetCommandFileName" ||
      n.name === "AssetCommandFilterName" ||
      n.name === "AssetCommandTarget" ||
      n.name === "NameValue"
  );
  if (!renamableNode) {
    console.warn(leftStack.map((n) => n.name));
    return null;
  }
  return renamableNode;
};
