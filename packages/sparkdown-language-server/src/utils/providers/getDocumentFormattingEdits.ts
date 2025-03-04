import {
  type Position,
  type FormattingOptions,
  type TextEdit,
} from "vscode-languageserver";
import {
  type TextDocument,
  type Range,
} from "vscode-languageserver-textdocument";

import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";

const TAB_REGEX = /\t/g;

const isInRange = (
  document: TextDocument,
  innerRange: Range,
  outerRange: Range
) => {
  return (
    document.offsetAt(innerRange.start) >=
      document.offsetAt(outerRange.start) &&
    document.offsetAt(innerRange.end) <= document.offsetAt(outerRange.end)
  );
};

export const getDocumentFormattingEdits = (
  document: TextDocument | undefined,
  annotations: SparkdownAnnotations | undefined,
  options: FormattingOptions,
  formattingRange?: Range
): TextEdit[] | undefined => {
  if (!document || !annotations) {
    return undefined;
  }
  const result: TextEdit[] = [];
  const pushIfInRange = (edit: TextEdit) => {
    if (!formattingRange || isInRange(document, edit.range, formattingRange)) {
      result.push(edit);
    }
  };
  let indentLevel = 0;
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
          ? text.replace(TAB_REGEX, " ".repeat(options.tabSize))
          : text;
        const includesTab = text.includes("\t");
        if (cur.value.type === "indent") {
          if (normalizedWhitespace.length > indentLevel * options.tabSize) {
            indentLevel++;
          } else if (
            normalizedWhitespace.length <
            indentLevel * options.tabSize
          ) {
            indentLevel--;
          }
          if (
            (!includesTab || options.insertSpaces) &&
            normalizedWhitespace.length !== indentLevel * options.tabSize
          ) {
            pushIfInRange({
              range,
              newText: " ".repeat(indentLevel * options.tabSize),
            });
          }
        }
        if (cur.value.type === "separator") {
          if (text.length > 1) {
            pushIfInRange({
              range,
              newText: " ",
            });
          } else if (options.insertSpaces && includesTab) {
            const newText = normalizedWhitespace;
            pushIfInRange({
              range,
              newText,
            });
          }
        }
        if (cur.value.type === "extra") {
          if (text.length > 0) {
            pushIfInRange({
              range,
              newText: "",
            });
          }
        }
        if (cur.value.type === "trailing") {
          if (options.trimTrailingWhitespace && text.length > 0) {
            pushIfInRange({
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
        pushIfInRange({
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
        pushIfInRange({
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
