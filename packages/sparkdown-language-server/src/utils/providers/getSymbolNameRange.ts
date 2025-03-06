import {
  type TextDocument,
  type Range,
} from "vscode-languageserver-textdocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";

export const getSymbolNameRange = (
  document: TextDocument | undefined,
  symbol: GrammarSyntaxNode<SparkdownNodeName>
): Range | null | undefined => {
  if (!document) {
    return undefined;
  }
  const symbolRange = {
    start: document.positionAt(symbol.from),
    end: document.positionAt(symbol.to),
  };
  if (symbol.name === "IncludeContent") {
    const range = {
      start: document.positionAt(symbol.from),
      end: document.positionAt(symbol.to),
    };
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
    return nameRange;
  }
  return symbolRange;
};
