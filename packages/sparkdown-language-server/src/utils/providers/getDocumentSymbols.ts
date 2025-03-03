import { SymbolKind, type DocumentSymbol } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

export interface DocumentSymbolMark {
  type: "knot" | "stitch";
  symbol: DocumentSymbol;
}

export const getDocumentSymbols = (
  document: TextDocument | undefined,
  annotations: SparkdownAnnotations | undefined
): DocumentSymbol[] => {
  const symbols: DocumentSymbol[] = [];
  if (!document || !annotations) {
    return symbols;
  }
  const headingMarks: DocumentSymbolMark[] = [];
  const knotMarks: DocumentSymbolMark[] = [];
  const cur = annotations.declarations?.iter();
  if (cur) {
    while (cur.value) {
      if (cur.value.type === "knot") {
        const nameRange = {
          start: document.positionAt(cur.from),
          end: document.positionAt(cur.to),
        };
        const lineRange = {
          start: {
            line: nameRange.start.line,
            character: 0,
          },
          end: {
            line: nameRange.end.line,
            character: nameRange.end.character,
          },
        };
        const name = document.getText(nameRange);
        const line = document.positionAt(cur.from).line;
        const mark: DocumentSymbolMark = {
          type: "knot",
          symbol: {
            name,
            kind: SymbolKind.Class,
            range: structuredClone(lineRange),
            selectionRange: lineRange,
          },
        };
        const lastKnot = headingMarks.findLast((m) => m.type === "knot");
        if (lastKnot) {
          lastKnot.symbol.range.end.line = line - 1;
          lastKnot.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        const prevHeading = headingMarks.at(-1);
        if (prevHeading?.type === "knot" || prevHeading?.type === "stitch") {
          prevHeading.symbol.range.end.line = line - 1;
          prevHeading.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        knotMarks.push(mark);
        headingMarks.push(mark);
      }
      if (cur.value.type === "stitch") {
        const nameRange = {
          start: document.positionAt(cur.from),
          end: document.positionAt(cur.to),
        };
        const lineRange = {
          start: {
            line: nameRange.start.line,
            character: 0,
          },
          end: {
            line: nameRange.end.line,
            character: nameRange.end.character,
          },
        };
        const name = document.getText(nameRange);
        const line = document.positionAt(cur.from).line;
        const mark: DocumentSymbolMark = {
          type: "stitch",
          symbol: {
            name,
            kind: SymbolKind.Interface,
            range: structuredClone(lineRange),
            selectionRange: lineRange,
          },
        };
        const lastKnot = headingMarks.findLast((m) => m.type === "knot");
        if (lastKnot) {
          lastKnot.symbol.children ??= [];
          lastKnot.symbol.children.push(mark.symbol);
        }
        const prevHeading = headingMarks.at(-1);
        if (prevHeading?.type === "stitch") {
          prevHeading.symbol.range.end.line = line - 1;
          prevHeading.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        headingMarks.push(mark);
      }
      cur.next();
    }
  }
  const lastKnot = headingMarks.findLast((m) => m.type === "knot");
  if (
    lastKnot &&
    lastKnot.symbol.range.end.line === lastKnot.symbol.range.start.line
  ) {
    lastKnot.symbol.range.end.line = document.lineCount - 1;
    lastKnot.symbol.range.end.character = document.positionAt(
      document.lineCount - 1
    ).character;
  }
  const lastStitch = headingMarks.findLast((m) => m.type === "stitch");
  if (
    lastStitch &&
    lastStitch.symbol.range.end.line === lastStitch.symbol.range.start.line
  ) {
    lastStitch.symbol.range.end.line = document.lineCount - 1;
    lastStitch.symbol.range.end.character = document.positionAt(
      document.lineCount - 1
    ).character;
  }
  const result = knotMarks.map((s) => s.symbol);
  return result;
};
