import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SymbolKind, type DocumentSymbol } from "vscode-languageserver";
import { Position, Range } from "vscode-languageserver-textdocument";

export interface DocumentSymbolMark {
  type: "function" | "scene" | "branch" | "label";
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
  annotations: SparkdownAnnotations | undefined,
): DocumentSymbol[] => {
  const symbols: DocumentSymbol[] = [];
  if (!document || !annotations) {
    return symbols;
  }
  const headingMarks: DocumentSymbolMark[] = [];
  const topMarks: DocumentSymbolMark[] = [];
  // Scenes and branches whose `end` has been reached. Their range ends at that
  // `end`, and later declarations are no longer placed inside them.
  const closed = new Set<DocumentSymbolMark>();
  // Ends a still-open heading's range on the line before a following heading.
  const endBefore = (mark: DocumentSymbolMark | undefined, line: number) => {
    if (mark && !closed.has(mark)) {
      mark.symbol.range.end.line = line - 1;
      mark.symbol.range.end.character = document.positionAt(
        line - 1,
      ).character;
    }
  };
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
        endBefore(headingMarks.at(-1), line);
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
        endBefore(topMarks.at(-1), line);
        endBefore(
          headingMarks.findLast((m) => m.type === "branch"),
          line,
        );
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
            (m.type === "function" || m.type === "scene") && !closed.has(m),
        );
        if (lastTopHeading?.type === "scene") {
          lastTopHeading.symbol.children ??= [];
          lastTopHeading.symbol.children.push(mark.symbol);
        } else {
          topMarks.push(mark);
        }
        endBefore(
          headingMarks.findLast((m) => m.type === "branch"),
          line,
        );
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
        const lastHeading = headingMarks.findLast(
          (m) => m.type !== "label" && !closed.has(m),
        );
        if (lastHeading) {
          lastHeading.symbol.children ??= [];
          lastHeading.symbol.children.push(mark.symbol);
        }
        headingMarks.push(mark);
      }
      // END
      if (cur.value.type === "end") {
        const open = headingMarks.findLast(
          (m) => (m.type === "scene" || m.type === "branch") && !closed.has(m),
        );
        if (open) {
          open.symbol.range.end = document.range(cur.from, cur.to).end;
          closed.add(open);
        }
      }
      cur.next();
    }
  }
  const lastTop = headingMarks.findLast(
    (m) => m.type === "function" || m.type === "scene",
  );
  if (
    lastTop &&
    lastTop.symbol.range.end.line === lastTop.symbol.range.start.line
  ) {
    lastTop.symbol.range.end.line = document.lineCount - 1;
    lastTop.symbol.range.end.character = document.positionAt(
      document.lineCount - 1,
    ).character;
  }
  const lastNested = headingMarks.findLast(
    (m) => m.type === "branch",
  );
  if (
    lastNested &&
    lastNested.symbol.range.end.line === lastNested.symbol.range.start.line
  ) {
    lastNested.symbol.range.end.line = document.lineCount - 1;
    lastNested.symbol.range.end.character = document.positionAt(
      document.lineCount - 1,
    ).character;
  }
  const result = topMarks
    .filter(
      (s) =>
        Boolean(s.symbol.name) &&
        Boolean(isRangeContained(s.symbol.range, s.symbol.selectionRange)),
    )
    .map((s) => s.symbol);
  return result;
};
