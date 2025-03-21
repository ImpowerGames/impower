import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { SymbolKind, type DocumentSymbol } from "vscode-languageserver";

export interface DocumentSymbolMark {
  type: "function" | "knot" | "stitch" | "label";
  symbol: DocumentSymbol;
}

export const getDocumentSymbols = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations | undefined
): DocumentSymbol[] => {
  const symbols: DocumentSymbol[] = [];
  if (!document || !annotations) {
    return symbols;
  }
  const headingMarks: DocumentSymbolMark[] = [];
  const topMarks: DocumentSymbolMark[] = [];
  const cur = annotations.declarations?.iter();
  if (cur) {
    while (cur.value) {
      const nameRange = document.range(cur.from, cur.to);
      const lineRange = {
        start: {
          line: nameRange.start.line,
          character: 0,
        },
        end: {
          line: nameRange.end.line,
          character: nameRange.end.character,
        },
      }; // FUNCTION
      if (cur.value.type === "function") {
        const name = document.getText(nameRange);
        const line = document.positionAt(cur.from).line;
        const mark: DocumentSymbolMark = {
          type: "function",
          symbol: {
            name,
            kind: SymbolKind.Function,
            range: structuredClone(lineRange),
            selectionRange: lineRange,
          },
        };
        const lastHeading = headingMarks.findLast(
          (m) =>
            m.type === "function" || m.type === "knot" || m.type === "stitch"
        );
        if (lastHeading) {
          lastHeading.symbol.range.end.line = line - 1;
          lastHeading.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        topMarks.push(mark);
        headingMarks.push(mark);
      }
      // KNOT
      if (cur.value.type === "knot") {
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
        const lastTopHeading = topMarks.at(-1);
        if (lastTopHeading) {
          lastTopHeading.symbol.range.end.line = line - 1;
          lastTopHeading.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        const lastStitch = headingMarks.findLast((m) => m.type === "stitch");
        if (lastStitch) {
          lastStitch.symbol.range.end.line = line - 1;
          lastStitch.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        topMarks.push(mark);
        headingMarks.push(mark);
      }
      // STITCH
      if (cur.value.type === "stitch") {
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
        const lastTopHeading = headingMarks.findLast(
          (m) => m.type === "function" || m.type === "knot"
        );
        if (lastTopHeading) {
          if (lastTopHeading.type === "knot") {
            lastTopHeading.symbol.children ??= [];
            lastTopHeading.symbol.children.push(mark.symbol);
          } else {
            topMarks.push(mark);
          }
        }
        const lastStitch = headingMarks.findLast((m) => m.type === "stitch");
        if (lastStitch) {
          lastStitch.symbol.range.end.line = line - 1;
          lastStitch.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        headingMarks.push(mark);
      }
      // LABEL
      if (cur.value.type === "label") {
        const name = document.getText(nameRange);
        const mark: DocumentSymbolMark = {
          type: "label",
          symbol: {
            name,
            kind: SymbolKind.EnumMember,
            range: structuredClone(nameRange),
            selectionRange: nameRange,
          },
        };
        const lastKnotOrStitch = headingMarks.findLast(
          (m) => m.type === "knot" || m.type === "stitch"
        );
        if (lastKnotOrStitch) {
          lastKnotOrStitch.symbol.children ??= [];
          lastKnotOrStitch.symbol.children.push(mark.symbol);
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
  const result = topMarks
    .filter((s) => Boolean(s.symbol.name))
    .map((s) => s.symbol);
  return result;
};
