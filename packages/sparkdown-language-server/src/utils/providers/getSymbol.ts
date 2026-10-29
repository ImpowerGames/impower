import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { runOperandNameSpan } from "@impower/sparkdown/src/compiler/utils/runOperand";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { Tree } from "@lezer/common";
import { Position } from "vscode-languageserver";
import { type Range } from "vscode-languageserver-textdocument";

const findCharacterNameValue = (
  document: SparkdownDocument,
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
):
  | { symbol: GrammarSyntaxNode<SparkdownNodeName>; nameRange: Range; canRename: true }
  | undefined => {
  const contentNode = stack.find(
    (n) => n.name === "LuauDoubleQuotedString_content",
  );
  if (!contentNode) {
    return undefined;
  }
  const propertyDefinition = stack.find(
    (n) => n.name === "LuauPropertyDefinition",
  );
  if (!propertyDefinition) {
    return undefined;
  }
  const propertyNameNode = getDescendent("LuauVariableName", propertyDefinition);
  if (
    !propertyNameNode ||
    document.read(propertyNameNode.from, propertyNameNode.to).trim() !== "name"
  ) {
    return undefined;
  }
  const defineNode = stack.find((n) => n.name === "LuauDefine");
  if (!defineNode) {
    return undefined;
  }
  const parentNode = getDescendent("LuauDefineParentName", defineNode);
  if (
    !parentNode ||
    document.read(parentNode.from, parentNode.to).trim() !== "character"
  ) {
    return undefined;
  }
  return {
    symbol: contentNode,
    nameRange: document.range(contentNode.from, contentNode.to),
    canRename: true,
  };
};

export const getSymbol = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  position: Position,
): {
  symbol?: GrammarSyntaxNode<SparkdownNodeName>;
  nameRange?: Range;
  canRename?: boolean;
} => {
  if (!document || !tree) {
    return {};
  }
  const stacks = [
    getStack<SparkdownNodeName>(tree, document.offsetAt(position), 1),
    getStack<SparkdownNodeName>(tree, document.offsetAt(position), -1),
  ];
  for (const stack of stacks) {
    const characterNameValue = findCharacterNameValue(document, stack);
    if (characterNameValue) {
      return characterNameValue;
    }
    const symbol = stack.find(
      (n) =>
        n.name === "LuauFunctionName" ||
        n.name === "SceneDeclarationName" ||
        n.name === "BranchDeclarationName" ||
        n.name === "LabelDeclarationName" ||
        n.name === "DivertPartName" ||
        n.name === "LuauDefineName" ||
        n.name === "LuauDefineParentName" ||
        n.name === "StylingDeclarationScalarPropertyName" ||
        n.name === "DeclarationScalarPropertyKey" ||
        n.name === "BuiltinComponentName" ||
        n.name === "CustomComponentName" ||
        n.name === "LuauSparkleElementName" ||
        n.name === "LuauSparkleClassName" ||
        n.name === "ComponentName" ||
        n.name === "PropertyName" ||
        n.name === "SelectorPropertyNamePart" ||
        n.name === "LuauVariableName" ||
        n.name === "TypeName" ||
        n.name === "DialogueCharacterName" ||
        n.name === "AssetCommandFileName" ||
        n.name === "AssetCommandTarget" ||
        n.name === "NameValue" ||
        n.name === "RunContent",
    );
    if (symbol) {
      const symbolRange = document.range(symbol.from, symbol.to);
      if (symbol.name === "RunContent") {
        const [start, end] = runOperandNameSpan(
          document.read(symbol.from, symbol.to),
        );
        const nameRange = document.range(symbol.from + start, symbol.from + end);
        return { symbol, nameRange, canRename: true };
      }
      return { symbol, nameRange: symbolRange, canRename: true };
    }
  }

  const leftStack = getStack<SparkdownNodeName>(
    tree,
    document.offsetAt(position),
    1,
  );
  const rightStack = getStack<SparkdownNodeName>(
    tree,
    document.offsetAt(position),
    -1,
  );

  const textSymbol = leftStack[0] || rightStack[0];
  if (textSymbol?.name !== "sparkdown") {
    if (textSymbol) {
      const textSymbolRange = document.range(textSymbol.from, textSymbol.to);
      const name = document.read(textSymbol.from, textSymbol.to);
      if (name.trim()) {
        return { symbol: textSymbol, nameRange: textSymbolRange };
      }
    }
  }
  return {};
};
