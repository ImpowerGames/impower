import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { Tree } from "@lezer/common";
import { Position } from "vscode-languageserver";
import { type Range } from "vscode-languageserver-textdocument";

export const getSymbol = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  position: Position
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
    const symbol = stack.find(
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
        n.name === "NameValue" ||
        n.name === "IncludeContent" ||
        n.name === "StructFieldValue"
    );
    if (symbol) {
      const symbolRange = document.range(symbol.from, symbol.to);
      if (symbol.name === "StructFieldValue") {
        const defineDeclarationNode = stack.find(
          (n) => n.name === "DefineDeclaration"
        );
        if (defineDeclarationNode) {
          const defineTypeNode = getDescendent(
            "DefineTypeName",
            defineDeclarationNode
          );
          if (defineTypeNode) {
            const defineType = document.read(
              defineTypeNode.from,
              defineTypeNode.to
            );
            if (defineType === "character") {
              const structFieldNodes = stack.filter(
                (n) => n.name === "StructField"
              );
              if (structFieldNodes.length === 1) {
                const propertyNameNode = getDescendent(
                  "DeclarationScalarPropertyName",
                  structFieldNodes[0]!
                );
                if (propertyNameNode) {
                  const propertyName = document.read(
                    propertyNameNode.from,
                    propertyNameNode.to
                  );
                  if (propertyName === "name") {
                    const stringContentNode = stack.find(
                      (n) => n.name === "DoubleQuoteString_content"
                    );
                    if (stringContentNode) {
                      return {
                        symbol: stringContentNode,
                        nameRange: document.range(
                          stringContentNode.from,
                          stringContentNode.to
                        ),
                      };
                    }
                  }
                }
              }
            }
          }
        }
        return { symbol };
      }
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
    1
  );
  const rightStack = getStack<SparkdownNodeName>(
    tree,
    document.offsetAt(position),
    -1
  );

  const textSymbol = leftStack[0] || rightStack[0];
  if (textSymbol?.name !== "sparkdown") {
    if (textSymbol) {
      const textSymbolRange = document.range(textSymbol.from, textSymbol.to);
      return { symbol: textSymbol, nameRange: textSymbolRange };
    }
  }
  return {};
};
