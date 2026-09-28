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
  const topMarks: DocumentSymbolMark[] = [];
  // Scenes and branches not yet closed, outermost first. A root-level `end`
  // closes the innermost one; a new scene closes every open one and a new
  // branch closes an open branch, since neither nests inside its own kind.
  const open: DocumentSymbolMark[] = [];
  const lineText = (line: number) =>
    document.getText({
      start: { line, character: 0 },
      end: { line: line + 1, character: 0 },
    });
  const lineEnd = (line: number): Position => ({
    line,
    character: lineText(line).replace(/\r?\n$/, "").length,
  });
  const indentOf = (text: string) => text.match(/^[ \t]*/)![0].length;
  // The line holding the `end` that closes the function declared on `line`:
  // the first later non-blank line indented no deeper than the declaration.
  // The declarations channel records no function extent, so indentation
  // stands in for it.
  const functionEndLine = (line: number) => {
    const indent = indentOf(lineText(line));
    for (let i = line + 1; i < document.lineCount; i += 1) {
      const text = lineText(i);
      if (text.trim() && indentOf(text) <= indent) {
        return /^\s*end\b/.test(text) ? i : i - 1;
      }
    }
    return document.lineCount - 1;
  };
  // Adds a symbol to the innermost open scene or branch, or to the top level.
  const place = (mark: DocumentSymbolMark) => {
    const parent = open.at(-1);
    if (parent) {
      parent.symbol.children ??= [];
      parent.symbol.children.push(mark.symbol);
    } else {
      topMarks.push(mark);
    }
  };
  // Ends a heading that closes without its own `end` on the line before the
  // declaration that closes it.
  const closeBefore = (mark: DocumentSymbolMark, line: number) => {
    mark.symbol.range.end = lineEnd(Math.max(line - 1, 0));
  };
  const cur = annotations.declarations?.iter();
  if (cur) {
    while (cur.value) {
      const nameRange = document.range(cur.from, cur.to);
      const line = nameRange.start.line;
      const lineRange = {
        start: {
          line,
          character: 0,
        },
        end: {
          line: nameRange.end.line,
          character: nameRange.end.character,
        },
      };
      const heading = (
        type: DocumentSymbolMark["type"],
        kind: SymbolKind,
      ): DocumentSymbolMark => ({
        type,
        symbol: {
          name: document.getText(nameRange),
          kind,
          range: structuredClone(lineRange),
          selectionRange: lineRange,
        },
      });
      // FUNCTION
      if (cur.value.type === "function") {
        const mark = heading("function", SymbolKind.Function);
        mark.symbol.range.end = lineEnd(functionEndLine(line));
        place(mark);
      }
      // SCENE
      if (cur.value.type === "scene") {
        for (const o of open.splice(0)) {
          closeBefore(o, line);
        }
        const mark = heading("scene", SymbolKind.Class);
        place(mark);
        open.push(mark);
      }
      // BRANCH
      if (cur.value.type === "branch") {
        if (open.at(-1)?.type === "branch") {
          closeBefore(open.pop()!, line);
        }
        const mark = heading("branch", SymbolKind.Interface);
        place(mark);
        open.push(mark);
      }
      // LABEL
      if (cur.value.type === "label") {
        place({
          type: "label",
          symbol: {
            name: document.getText(nameRange),
            kind: SymbolKind.EnumMember,
            range: structuredClone(nameRange),
            selectionRange: nameRange,
          },
        });
      }
      // END
      if (cur.value.type === "end") {
        const closed = open.pop();
        if (closed) {
          closed.symbol.range.end = nameRange.end;
        }
      }
      cur.next();
    }
  }
  // A scene or branch missing its `end` runs to the end of the document.
  for (const o of open) {
    o.symbol.range.end = lineEnd(document.lineCount - 1);
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
