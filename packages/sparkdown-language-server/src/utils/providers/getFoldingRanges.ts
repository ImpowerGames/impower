import { FoldingRange, Range } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "../../../../sparkdown/src/types/SparkProgram";

const INDENT_REGEX = /^([ \t]+)/;

export const getFoldingRanges = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined
): FoldingRange[] => {
  const result: FoldingRange[] = [];
  if (!document) {
    return result;
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
      result.push({
        startLine,
        endLine,
      });
    }
  });
  if (!program) {
    return result;
  }
  // TODO: Support weave folding
  if (program.sections) {
    const sections = Object.values(program.sections);
    const getSectionEndLine = (index: number): number => {
      const curr = sections[index]!;
      for (let i = index + 1; i < sections.length; i += 1) {
        const next = sections[i]!;
        if (next.level! <= curr.level!) {
          // fold ends the line before the next section
          return next.line - 1;
        }
      }
      return document.lineCount - 1;
    };
    sections.forEach((curr, sectionIndex) => {
      if (!curr.name) {
        return;
      }
      if (curr.line >= 0) {
        result.push({
          startLine: curr.line,
          endLine: getSectionEndLine(sectionIndex),
        });
      }
    });
  }
  return result;
};
