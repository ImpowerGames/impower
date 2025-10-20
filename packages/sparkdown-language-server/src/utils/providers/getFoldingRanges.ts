import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Range, type FoldingRange } from "vscode-languageserver";

const INDENT_REGEX = /^([ \t]+)/;

export const getFoldingRanges = (
  document: SparkdownDocument | undefined,
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
      if (cur.value.type === "function") {
        const line = document.positionAt(cur.from).line;
        const lastTop = headingFolding.findLast(
          (h) =>
            h.kind === "function" || h.kind === "scene" || h.kind === "knot"
        );
        if (lastTop) {
          lastTop.endLine = line - 1;
        }
        const prevHeading = headingFolding.at(-1);
        if (prevHeading) {
          prevHeading.endLine = line - 1;
        }
        headingFolding.push({
          startLine: line,
          endLine: line,
          kind: "function",
        });
      }
      if (cur.value.type === "scene") {
        const line = document.positionAt(cur.from).line;
        const lastTop = headingFolding.findLast(
          (h) =>
            h.kind === "function" || h.kind === "scene" || h.kind === "knot"
        );
        if (lastTop) {
          lastTop.endLine = line - 1;
        }
        const prevHeading = headingFolding.at(-1);
        if (prevHeading) {
          prevHeading.endLine = line - 1;
        }
        headingFolding.push({
          startLine: line,
          endLine: line,
          kind: "scene",
        });
      }
      if (cur.value.type === "branch") {
        const line = document.positionAt(cur.from).line;
        const prevHeading = headingFolding.at(-1);
        if (prevHeading?.kind === "branch" || prevHeading?.kind === "stitch") {
          prevHeading.endLine = line - 1;
        }
        headingFolding.push({
          startLine: line,
          endLine: line,
          kind: "branch",
        });
      }
      if (cur.value.type === "knot") {
        const line = document.positionAt(cur.from).line;
        const lastTop = headingFolding.findLast(
          (h) =>
            h.kind === "function" || h.kind === "scene" || h.kind === "knot"
        );
        if (lastTop) {
          lastTop.endLine = line - 1;
        }
        const prevHeading = headingFolding.at(-1);
        if (prevHeading) {
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
        if (prevHeading?.kind === "branch" || prevHeading?.kind === "stitch") {
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
  const lastTop = headingFolding.findLast(
    (h) => h.kind === "function" || h.kind === "scene" || h.kind === "knot"
  );
  if (lastTop && lastTop.endLine === lastTop.startLine) {
    lastTop.endLine = document.lineCount - 1;
  }
  const lastNested = headingFolding.findLast(
    (h) => h.kind === "branch" || h.kind === "stitch"
  );
  if (lastNested && lastNested.endLine === lastNested.startLine) {
    lastNested.endLine = document.lineCount - 1;
  }
  const result = [...indentFolding, ...headingFolding].sort(
    (a, b) => a.startLine - b.startLine
  );
  return result;
};
