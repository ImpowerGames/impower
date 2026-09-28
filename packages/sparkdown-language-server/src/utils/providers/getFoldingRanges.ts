import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { type Tree } from "@lezer/common";
import { Range, type FoldingRange } from "vscode-languageserver";
import {
  getDeclarationHeadings,
  type DeclarationHeading,
} from "../annotations/getDeclarationHeadings";

const INDENT_REGEX = /^([ \t]+)/;

export const getFoldingRanges = (
  document: SparkdownDocument | undefined,
  annotations: SparkdownAnnotations,
  program: SparkProgram | undefined,
  tree: Tree | undefined,
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
  // Each scene, branch and function folds over the same extent the outline
  // gives it.
  const headingFolding: FoldingRange[] = [];
  const addFolds = (headings: DeclarationHeading[]) => {
    for (const heading of headings) {
      if (heading.type !== "label") {
        headingFolding.push({
          startLine: heading.nameRange.start.line,
          endLine: heading.end.line,
          kind: heading.type,
        });
      }
      addFolds(heading.children);
    }
  };
  addFolds(getDeclarationHeadings(document, annotations, tree));
  const result = [...indentFolding, ...headingFolding].sort(
    (a, b) => a.startLine - b.startLine,
  );
  return result;
};
