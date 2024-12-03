import { DocumentSymbol, SymbolKind } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";
import { StructureItem } from "../../../../sparkdown/src/types/StructureItem";

const getDocumentSymbol = (
  structure: Record<string, StructureItem>,
  item: StructureItem
): DocumentSymbol => {
  const children: DocumentSymbol[] = [];
  item.children.forEach((child) => {
    const s = structure[child];
    if (s?.text) {
      children.push(getDocumentSymbol(structure, structure[child]!));
    }
  });
  return {
    name: item.text,
    kind:
      item.type === "chunk"
        ? SymbolKind.File
        : item.type === "section"
        ? SymbolKind.Number
        : SymbolKind.String,
    range: item.range,
    selectionRange: item.selectionRange,
    children,
  };
};

export const getDocumentSymbols = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined
): DocumentSymbol[] => {
  const symbols: DocumentSymbol[] = [];
  const structure = program?.metadata?.scopes;
  if (!document || !structure) {
    return symbols;
  }
  Object.values(structure).forEach((item) => {
    if (item.level === 0 && item.text) {
      symbols.push(getDocumentSymbol(structure, item));
    }
  });
  // If no root labels exist, treat all level 1 sections as roots
  if (symbols.length === 0) {
    Object.values(structure).forEach((item) => {
      if (item.level === 1 && item.text) {
        symbols.push(getDocumentSymbol(structure, item));
      }
    });
  }
  return symbols;
};
