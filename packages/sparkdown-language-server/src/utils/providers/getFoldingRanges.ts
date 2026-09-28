import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { Range, type FoldingRange } from "vscode-languageserver";

const INDENT_REGEX = /^([ \t]+)/;

export const getFoldingRanges = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations,
  program: SparkProgram | undefined,
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
        return getPrevNonBlankLine(i);
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
  // Scene and branch folds not yet closed, outermost first. A root-level `end`
  // closes the innermost one; a new scene closes every open one and a new
  // branch closes an open branch, since neither nests inside its own kind.
  const open: FoldingRange[] = [];
  // A function declared outside any scene or branch folds until the next
  // scene or function. One declared inside a scene or branch gets no heading
  // fold of its own: its body is indented, so indentation folding covers it.
  let topFunction: FoldingRange | undefined;
  const cur = annotations.declarations?.iter();
  if (cur) {
    while (cur.value) {
      const line = document.positionAt(cur.from).line;
      if (cur.value.type === "function" || cur.value.type === "scene") {
        if (topFunction) {
          topFunction.endLine = line - 1;
          topFunction = undefined;
        }
      }
      if (cur.value.type === "function" && open.length === 0) {
        topFunction = { startLine: line, endLine: line, kind: "function" };
        headingFolding.push(topFunction);
      }
      if (cur.value.type === "scene") {
        for (const o of open.splice(0)) {
          o.endLine = line - 1;
        }
        const fold = { startLine: line, endLine: line, kind: "scene" };
        headingFolding.push(fold);
        open.push(fold);
      }
      if (cur.value.type === "branch") {
        if (open.at(-1)?.kind === "branch") {
          open.pop()!.endLine = line - 1;
        }
        const fold = { startLine: line, endLine: line, kind: "branch" };
        headingFolding.push(fold);
        open.push(fold);
      }
      if (cur.value.type === "end") {
        const closed = open.pop();
        if (closed) {
          closed.endLine = line;
        }
      }
      cur.next();
    }
  }
  // A fold still open at the end of the document runs to its last line.
  for (const fold of topFunction ? [...open, topFunction] : open) {
    fold.endLine = document.lineCount - 1;
  }
  const result = [...indentFolding, ...headingFolding].sort(
    (a, b) => a.startLine - b.startLine,
  );
  return result;
};
