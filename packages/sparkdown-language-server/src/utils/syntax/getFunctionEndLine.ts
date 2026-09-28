import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";

const lineText = (document: SparkdownDocument, line: number) =>
  document.getText({
    start: { line, character: 0 },
    end: { line: line + 1, character: 0 },
  });

const indentOf = (text: string) => text.match(/^[ \t]*/)![0].length;

/**
 * The line holding the `end` that closes the function declared on `line`: the
 * first later non-blank line indented no deeper than the declaration, or the
 * line before it when that line is not an `end`. The declarations channel
 * records no function extent, so the outline and folding both use this.
 */
export const getFunctionEndLine = (
  document: SparkdownDocument,
  line: number,
): number => {
  const indent = indentOf(lineText(document, line));
  for (let i = line + 1; i < document.lineCount; i += 1) {
    const text = lineText(document, i);
    if (text.trim() && indentOf(text) <= indent) {
      return /^\s*end\b/.test(text) ? i : i - 1;
    }
  }
  return document.lineCount - 1;
};
