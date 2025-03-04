import { type FormattingOptions, type TextEdit } from "vscode-languageserver";
import {
  type TextDocument,
  type Range,
} from "vscode-languageserver-textdocument";

import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

export const getDocumentFormatting = (
  document: TextDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  options: FormattingOptions
): TextEdit[] => {
  const result: TextEdit[] = [];
  if (!document || !annotations) {
    return result;
  }
  const cur = annotations.formatting?.iter();
  if (cur) {
    let newlineRanges: Range[] = [];
    while (cur.value) {
      const range = {
        start: document.positionAt(cur.from),
        end: document.positionAt(cur.to),
      };
      if (cur.value.type === "newline") {
        newlineRanges.push(range);
      } else {
        const text = document.getText(range);
        const normalizedWhitespace = options.insertSpaces
          ? text.replaceAll("\t", " ".repeat(options.tabSize))
          : text;
        const includesTab = text.includes("\t");
        if (cur.value.type === "indent") {
          if (
            (!includesTab || options.insertSpaces) &&
            normalizedWhitespace.length % options.tabSize !== 0
          ) {
            const roundedIndentSize =
              Math.round(normalizedWhitespace.length / options.tabSize) *
              options.tabSize;
            result.push({
              range,
              newText: " ".repeat(roundedIndentSize),
            });
          }
        }
        if (cur.value.type === "separator") {
          if (text.length > 1) {
            result.push({
              range,
              newText: " ",
            });
          } else if (options.insertSpaces && includesTab) {
            const newText = normalizedWhitespace;
            result.push({
              range,
              newText,
            });
          }
        }
        if (cur.value.type === "extra") {
          if (text.length > 0) {
            result.push({
              range,
              newText: "",
            });
          }
        }
        if (cur.value.type === "trailing") {
          if (options.trimTrailingWhitespace && text.length > 0) {
            result.push({
              range,
              newText: "",
            });
          }
        }
      }
      cur.next();
    }
    if (options.insertFinalNewline) {
      const lastPosition = document.positionAt(Number.MAX_VALUE);
      const lastNewlineRange = newlineRanges.at(-1);
      if (!lastNewlineRange || lastNewlineRange.end.line < lastPosition.line) {
        result.push({
          range: {
            start: lastPosition,
            end: lastPosition,
          },
          newText: "\n",
        });
      }
    }
    if (options.trimFinalNewlines) {
      let lastNewlineRange = newlineRanges.pop();
      let docLength =
        document.offsetAt(document.positionAt(Number.MAX_VALUE)) + 1;
      while (
        lastNewlineRange &&
        document.offsetAt(lastNewlineRange.end) === docLength - 1
      ) {
        result.push({
          range: lastNewlineRange,
          newText: "",
        });
        lastNewlineRange = newlineRanges.pop();
        docLength -= 1;
      }
    }
  }
  return result;
};
