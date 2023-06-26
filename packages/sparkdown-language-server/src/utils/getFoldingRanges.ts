import { FoldingRange } from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

import type { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import { SparkSection } from "../../../sparkdown/src/types/SparkSection";

const getFoldingRanges = (
  document: TextDocument | undefined,
  program: SparkProgram | undefined
): FoldingRange[] => {
  const result: FoldingRange[] = [];
  if (!document || !program) {
    return result;
  }
  const sections = program.sections;
  if (!sections) {
    return result;
  }
  const values = Object.values(sections);
  const getEndLine = (s: SparkSection, index: number): number => {
    for (let i = index + 1; i < values.length; i += 1) {
      const next = values[i]!;
      if (next.level! <= s.level!) {
        return next.line - 1;
      }
    }
    return document.lineCount - 1;
  };
  values.forEach((s, index) => {
    if (!s.name) {
      return;
    }
    result.push({
      startLine: s.line,
      endLine: getEndLine(s, index),
    });
  });
  return result;
};

export default getFoldingRanges;
