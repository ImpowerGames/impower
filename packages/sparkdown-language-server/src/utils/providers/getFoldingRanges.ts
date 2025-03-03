import { Range, type FoldingRange } from "vscode-languageserver";
import { type TextDocument } from "vscode-languageserver-textdocument";

import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

const INDENT_REGEX = /^([ \t]+)/;

export const getFoldingRanges = (
  document: TextDocument | undefined,
  annotations: SparkdownAnnotations,
  program: SparkProgram | undefined
): FoldingRange[] => {
  const indentFolding: FoldingRange[] = [];
  if (!document) {
    return indentFolding;
  }
  const lines: string[] = [];
  for (let i = 0; i < document.lineCount; i += 1) {
    lines.push(document.getText(Range.create(i, 0, i + 1, 0)));
  }
  // Support indentation folding
  const getIndentLevel = (text: string): number => {
    return text?.match(INDENT_REGEX)?.[1]?.length || 0;
  };
  const getPrevNonBlankLine = (index: number): number => {
    // Search backward for line that has content.
    for (let i = index - 1; i >= 0; i -= 1) {
      const prev = lines[i]!;
      if (prev.trim()) {
        return i;
      }
    }
    return index;
  };
  const getIndentationCloseLine = (index: number): number => {
    const curr = lines[index]!;
    // Find the next line that is indented less than the current line
    for (let i = index + 1; i < lines.length; i += 1) {
      const next = lines[i]!;
      if (next && getIndentLevel(next) <= getIndentLevel(curr)) {
        // fold ends the line before the outdented line
        return i - 1;
      }
    }
    return document.lineCount - 1;
  };
  lines.forEach((curr, lineIndex) => {
    const next = lines[lineIndex + 1];
    if (!next) {
      return;
    }
    const currDepth = getIndentLevel(curr);
    const nextDepth = getIndentLevel(next);
    if (nextDepth > currDepth) {
      const startLine = curr.trim()
        ? lineIndex
        : getPrevNonBlankLine(lineIndex);
      const endLine = getIndentationCloseLine(lineIndex);
      indentFolding.push({
        startLine,
        endLine,
        kind: "indent",
      });
    }
  });
  if (!program) {
    return indentFolding;
  }
  const headingFolding: FoldingRange[] = [];
  const cur = annotations.declarations?.iter();
  if (cur) {
    while (cur.value) {
      if (cur.value.type === "knot") {
        const line = document.positionAt(cur.from).line;
        const lastKnot = headingFolding.findLast((h) => h.kind === "knot");
        if (lastKnot) {
          lastKnot.endLine = line - 1;
        }
        const prevHeading = headingFolding.at(-1);
        if (prevHeading?.kind === "knot" || prevHeading?.kind === "stitch") {
          prevHeading.endLine = line - 1;
        }
        headingFolding.push({
          startLine: line,
          endLine: line,
          kind: "knot",
        });
      }
      if (cur.value.type === "stitch") {
        const line = document.positionAt(cur.from).line;
        const prevHeading = headingFolding.at(-1);
        if (prevHeading?.kind === "stitch") {
          prevHeading.endLine = line - 1;
        }
        headingFolding.push({
          startLine: line,
          endLine: line,
          kind: "stitch",
        });
      }
      cur.next();
    }
  }
  const lastKnot = headingFolding.findLast((h) => h.kind === "knot");
  if (lastKnot && lastKnot.endLine === lastKnot.startLine) {
    lastKnot.endLine = document.lineCount - 1;
  }
  const lastStitch = headingFolding.findLast((h) => h.kind === "stitch");
  if (lastStitch && lastStitch.endLine === lastStitch.startLine) {
    lastStitch.endLine = document.lineCount - 1;
  }
  const result = [...indentFolding, ...headingFolding].sort(
    (a, b) => a.startLine - b.startLine
  );
  return result;
};
