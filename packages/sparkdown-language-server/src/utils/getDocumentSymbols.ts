import { DocumentSymbol, SymbolKind } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { StructureItem } from "@impower/sparkdown/src/types/StructureItem";

const getDocumentSymbol = (
  structure: Record<string, StructureItem>,
  item: StructureItem
): DocumentSymbol => {
  return {
    name: item.text,
    kind:
      item.type === "label"
        ? SymbolKind.Constant
        : item.type === "section"
        ? SymbolKind.Number
        : SymbolKind.Interface,
    range: item.range,
    selectionRange: item.selectionRange,
    children: item.children.map((child) =>
      getDocumentSymbol(structure, structure[child]!)
    ),
  };
};

const getDocumentSymbols = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined
): DocumentSymbol[] => {
  const symbols: DocumentSymbol[] = [];
  const structure = program?.metadata?.structure;
  if (!document || !structure) {
    return symbols;
  }
  Object.values(structure).forEach((item) => {
    if (item.level === 0) {
      symbols.push(getDocumentSymbol(structure, item));
    }
  });
  // If no root labels exist, treat all level 1 sections as roots
  if (symbols.length === 0) {
    Object.values(structure).forEach((item) => {
      if (item.level === 1) {
        symbols.push(getDocumentSymbol(structure, item));
      }
    });
  }
  return symbols;
};

export default getDocumentSymbols;
