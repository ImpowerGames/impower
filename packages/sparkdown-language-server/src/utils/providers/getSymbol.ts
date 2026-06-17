import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { Tree } from "@lezer/common";
import { Position } from "vscode-languageserver";
import { type Range } from "vscode-languageserver-textdocument";

// The OOP `define <name> as character with name = "X" …` literal. Returns the
// string CONTENT node (`X`, quotes excluded) when the cursor is inside it, so
// rename/find-references key on the same range as the `character.?.name=X`
// annotation. Returns undefined for any other string.
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
    // A character's `name = "X"` literal: renaming/find-references targets the
    // string CONTENT (`X`), matching the `character.?.name=X` annotation the
    // ReferenceAnnotator emits over that same range. The Luau-port define is
    // `define <name> as character with name = "X"` — an OOP LuauPropertyDefinition
    // (not the pre-port struct field), so detect it via that shape.
    const characterNameValue = findCharacterNameValue(document, stack);
    if (characterNameValue) {
      return characterNameValue;
    }
    const symbol = stack.find(
      (n) =>
        // Narrative beats + functions
        n.name === "LuauFunctionName" ||
        n.name === "SceneDeclarationName" ||
        n.name === "BranchDeclarationName" ||
        n.name === "LabelDeclarationName" ||
        n.name === "DivertPartName" ||
        // Defines (inverted model): name is the instance/root-type, parent is
        // the type (OOP) or `$extends` (structural).
        n.name === "LuauDefineName" ||
        n.name === "LuauDefineParentName" ||
        // Struct-body property/header keys (style/screen/component/animation/theme)
        n.name === "StylingDeclarationScalarPropertyName" ||
        n.name === "DeclarationScalarPropertyKey" ||
        n.name === "BuiltinComponentName" ||
        n.name === "CustomComponentName" ||
        n.name === "ComponentName" ||
        n.name === "PropertyName" ||
        n.name === "SelectorPropertyNamePart" ||
        // Luau identifiers (variable reads/decls + OOP define property names)
        n.name === "LuauVariableName" ||
        n.name === "TypeName" ||
        // Narrative references
        n.name === "DialogueCharacterName" ||
        n.name === "AssetCommandFileName" ||
        n.name === "AssetCommandFilterName" ||
        n.name === "AssetCommandTarget" ||
        n.name === "NameValue" ||
        n.name === "IncludeContent",
    );
    if (symbol) {
      const symbolRange = document.range(symbol.from, symbol.to);
      if (symbol.name === "IncludeContent") {
        const range = document.range(symbol.from, symbol.to);
        const text = document.getText(range);
        const nameStartOffset = text.lastIndexOf("/") + 1;
        let nameEndOffset = text.indexOf(".", nameStartOffset);
        if (nameEndOffset < 0) {
          nameEndOffset = text.length;
        }
        const nameRange = {
          start: {
            line: range.start.line,
            character: range.start.character + nameStartOffset,
          },
          end: {
            line: range.start.line,
            character: range.start.character + nameEndOffset,
          },
        };
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
