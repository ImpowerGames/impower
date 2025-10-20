import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SymbolKind, type DocumentSymbol } from "vscode-languageserver";
import { Position, Range } from "vscode-languageserver-textdocument";

export interface DocumentSymbolMark {
  type: "function" | "scene" | "branch" | "knot" | "stitch" | "label";
  symbol: DocumentSymbol;
}

export const isRangeContained = (outer: Range, inner: Range): boolean => {
  const isAfterOrSame = (pos1: Position, pos2: Position): boolean =>
    pos1.line > pos2.line ||
    (pos1.line === pos2.line && pos1.character >= pos2.character);

  const isBeforeOrSame = (pos1: Position, pos2: Position): boolean =>
    pos1.line < pos2.line ||
    (pos1.line === pos2.line && pos1.character <= pos2.character);

  return (
    isAfterOrSame(inner.start, outer.start) &&
    isBeforeOrSame(inner.end, outer.end)
  );
};

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
        const lastHeading = headingMarks.at(-1);
        if (lastHeading) {
          lastHeading.symbol.range.end.line = line - 1;
          lastHeading.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        topMarks.push(mark);
        headingMarks.push(mark);
      }
      // SCENE
      if (cur.value.type === "scene") {
        const name = document.getText(nameRange);
        const line = document.positionAt(cur.from).line;
        const mark: DocumentSymbolMark = {
          type: "scene",
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
        const lastNested = headingMarks.findLast(
          (m) => m.type === "branch" || m.type === "stitch"
        );
        if (lastNested) {
          lastNested.symbol.range.end.line = line - 1;
          lastNested.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
        topMarks.push(mark);
        headingMarks.push(mark);
      }
      // BRANCH
      if (cur.value.type === "branch") {
        const name = document.getText(nameRange);
        const line = document.positionAt(cur.from).line;
        const mark: DocumentSymbolMark = {
          type: "branch",
          symbol: {
            name,
            kind: SymbolKind.Interface,
            range: structuredClone(lineRange),
            selectionRange: lineRange,
          },
        };
        const lastTopHeading = headingMarks.findLast(
          (m) =>
            m.type === "function" || m.type === "scene" || m.type === "knot"
        );
        if (lastTopHeading) {
          if (lastTopHeading.type === "function") {
            topMarks.push(mark);
          } else {
            lastTopHeading.symbol.children ??= [];
            lastTopHeading.symbol.children.push(mark.symbol);
          }
        }
        const lastNested = headingMarks.findLast(
          (m) => m.type === "branch" || m.type === "stitch"
        );
        if (lastNested) {
          lastNested.symbol.range.end.line = line - 1;
          lastNested.symbol.range.end.character = document.positionAt(
            line - 1
          ).character;
        }
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
        const lastNested = headingMarks.findLast(
          (m) => m.type === "branch" || m.type === "stitch"
        );
        if (lastNested) {
          lastNested.symbol.range.end.line = line - 1;
          lastNested.symbol.range.end.character = document.positionAt(
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
          (m) =>
            m.type === "function" || m.type === "scene" || m.type === "knot"
        );
        if (lastTopHeading) {
          if (lastTopHeading.type === "function") {
            topMarks.push(mark);
          } else {
            lastTopHeading.symbol.children ??= [];
            lastTopHeading.symbol.children.push(mark.symbol);
          }
        }
        const lastNested = headingMarks.findLast(
          (m) => m.type === "branch" || m.type === "stitch"
        );
        if (lastNested) {
          lastNested.symbol.range.end.line = line - 1;
          lastNested.symbol.range.end.character = document.positionAt(
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
        const lastHeading = headingMarks.findLast((m) => m.type !== "label");
        if (lastHeading) {
          lastHeading.symbol.children ??= [];
          lastHeading.symbol.children.push(mark.symbol);
        }
        headingMarks.push(mark);
      }
      cur.next();
    }
  }
  const lastTop = headingMarks.findLast(
    (m) => m.type === "function" || m.type === "scene" || m.type === "knot"
  );
  if (
    lastTop &&
    lastTop.symbol.range.end.line === lastTop.symbol.range.start.line
  ) {
    lastTop.symbol.range.end.line = document.lineCount - 1;
    lastTop.symbol.range.end.character = document.positionAt(
      document.lineCount - 1
    ).character;
  }
  const lastNested = headingMarks.findLast(
    (m) => m.type === "branch" || m.type === "stitch"
  );
  if (
    lastNested &&
    lastNested.symbol.range.end.line === lastNested.symbol.range.start.line
  ) {
    lastNested.symbol.range.end.line = document.lineCount - 1;
    lastNested.symbol.range.end.character = document.positionAt(
      document.lineCount - 1
    ).character;
  }
  const result = topMarks
    .filter(
      (s) =>
        Boolean(s.symbol.name) &&
        Boolean(isRangeContained(s.symbol.range, s.symbol.selectionRange))
    )
    .map((s) => s.symbol);
  return result;
};
