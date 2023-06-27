import { FoldingRange } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { SparkLineMetadata } from "../../../sparkdown/src/types/SparkLineMetadata";
import type { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";

/** Has some content that is not just whitespace */
const isContentful = (line: SparkLineMetadata) => line.length! > line.offset!;

const getFoldingRanges = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined
): FoldingRange[] => {
  const result: FoldingRange[] = [];
  if (!document || !program) {
    return result;
  }
  // Support section folding
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
      result.push({
        startLine: curr.line,
        endLine: getSectionEndLine(sectionIndex),
      });
    });
  }
  // Support indentation folding
  const lines = program.metadata.lines;
  if (lines) {
    const getPrevNonEmptyLine = (index: number): number => {
      // Search backward for line that has content.
      for (let i = index - 1; i >= 0; i -= 1) {
        const prev = lines[i]!;
        if (isContentful(prev)) {
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
        if (next.indent! <= curr.indent!) {
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
      const currDepth = curr.indent!;
      const nextDepth = next.indent!;
      if (nextDepth > currDepth) {
        const startLine = isContentful(curr)
          ? lineIndex
          : getPrevNonEmptyLine(lineIndex);
        const endLine = getIndentationCloseLine(lineIndex);
        result.push({
          startLine,
          endLine,
        });
      }
    });
  }
  return result;
};

export default getFoldingRanges;
