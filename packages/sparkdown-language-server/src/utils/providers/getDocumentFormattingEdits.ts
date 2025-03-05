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

const WHITESPACE_REGEX = /[\t ]*/;
const INDENT_REGEX: RegExp = /^[ \t]*/;

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

  const edits: TextEdit[] = [];

  const pushIfInRange = (edit: TextEdit) => {
    if (!formattingRange || isInRange(document, edit.range, formattingRange)) {
      edits.push(edit);
    }
  };

  let indentLevel = 0;
  let indentSize = 0;
  let processedLine = 0;

  const processIndent = (line: number) => {
    processedLine = line;
    const lineRange = {
      start: {
        line,
        character: 0,
      },
      end: {
        line,
        character: Number.MAX_VALUE,
      },
    };
    const lineText = document.getText(lineRange);
    const indentMatch = lineText.match(INDENT_REGEX);
    const indent = indentMatch?.[0] || "";
    if (indent.length === 0) {
      indentLevel = 0;
    } else if (indent.length > indentSize) {
      indentLevel++;
    } else if (indent.length < indentSize) {
      indentLevel = Math.max(0, indentLevel - 1);
    }
    indentSize = indent.length;
    if (indent.length > 0) {
      const indentRange = {
        start: {
          line: lineRange.start.line,
          character: 0,
        },
        end: {
          line: lineRange.start.line,
          character: indent.length,
        },
      };
      const targetIndent = " ".repeat(
        indentLevel *
          (indent.includes(" ") || options.insertSpaces ? options.tabSize : 1)
      );
      if (indent !== targetIndent) {
        pushIfInRange({
          range: indentRange,
          newText: targetIndent,
        });
      }
    }
  };
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
        processIndent(range.start.line);
      } else {
        const text = document.getText(range);
        if (cur.value.type === "separator") {
          if (text.length > 1) {
            pushIfInRange({
              range,
              newText: " ",
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
        if (
          cur.value.type === "choice_mark" ||
          cur.value.type === "gather_mark"
        ) {
          const text = document.getText(range);
          const formattedText = text.split(WHITESPACE_REGEX).join(" ");
          if (text !== formattedText) {
            // Omit first mark char to avoid overlapping with indent edits
            pushIfInRange({
              range: {
                start: {
                  line: range.start.line,
                  character: range.start.character + 1,
                },
                end: range.end,
              },
              newText: formattedText.slice(1),
            });
          }
        }
      }
      cur.next();
    }

    const lastPosition = document.positionAt(Number.MAX_VALUE);

    if (processedLine < lastPosition.line) {
      processIndent(lastPosition.line);
    }

    if (options.insertFinalNewline) {
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

  edits.sort(
    (a, b) =>
      document.offsetAt(a.range.start) - document.offsetAt(b.range.start)
  );

  const result = edits.filter((_, i) => {
    if (
      i - 1 >= 0 &&
      document.offsetAt(edits[i]!.range.start) <=
        document.offsetAt(edits[i - 1]!.range.end)
    ) {
      console.error(
        "ERROR:",
        JSON.stringify({
          line: edits[i]!.range.start.line + 1,
          oldText: document.getText(edits[i]!.range),
          newText: edits[i]?.newText,
        }),
        " overlaps with ",
        JSON.stringify({
          line: edits[i - 1]!.range.start.line + 1,
          oldText: document.getText(edits[i - 1]!.range),
          newText: edits[i - 1]?.newText,
        })
      );
      return false;
    }
    return true;
  });

  return result;
};
