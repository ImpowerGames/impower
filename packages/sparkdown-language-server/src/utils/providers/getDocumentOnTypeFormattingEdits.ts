import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { Tree } from "@lezer/common";
import {
  Position,
  type FormattingOptions,
  type TextEdit,
} from "vscode-languageserver";

export const getDocumentOnTypeFormattingEdits = (
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  options: FormattingOptions,
  position: Position,
  ch: string
): TextEdit[] | undefined => {
  if (!document || !tree) {
    return undefined;
  }
  const result: TextEdit[] = [];
  if (ch === ":" || ch === "\n") {
    const stack = getStack<SparkdownNodeName>(
      tree,
      document?.offsetAt({
        line: ch === "\n" ? position.line - 1 : position.line,
        character: Number.MAX_VALUE,
      }),
      -1
    );
    const dashClauseNode =
      stack.find((n) => n.name === "MultilineAlternativeClause") ||
      stack.find((n) => n.name === "MultilineCaseClause");
    if (dashClauseNode) {
      const conditionalBlockNode = stack.find(
        (n) => n.name === "ConditionalBlock"
      );
      if (conditionalBlockNode) {
        const markNode = getDescendent(
          ["MultilineAlternativeMark", "MultilineCaseMark"],
          dashClauseNode
        );
        if (markNode) {
          const braceRange = document.range(
            conditionalBlockNode.from,
            conditionalBlockNode.to
          );
          const markRange = document.range(markNode.from, markNode.to);
          const braceIndentRange = {
            start: {
              line: braceRange.start.line,
              character: 0,
            },
            end: {
              line: braceRange.start.line,
              character: braceRange.start.character,
            },
          };
          const markIndentRange = {
            start: {
              line: markRange.start.line,
              character: 0,
            },
            end: {
              line: markRange.start.line,
              character: markRange.start.character,
            },
          };
          const currentMarkIndentation = document.getText(markIndentRange);
          const currentBraceIndentation = document.getText(braceIndentRange);
          const braceIndentLevel = currentBraceIndentation.includes("\t")
            ? currentBraceIndentation.split("\t").length - 1
            : Math.round(currentBraceIndentation.length / options.tabSize);
          const expectedMarkIndentation = options.insertSpaces
            ? " ".repeat(braceIndentLevel * options.tabSize)
            : "\t".repeat(braceIndentLevel);
          if (currentMarkIndentation !== expectedMarkIndentation) {
            result.push({
              range: markIndentRange,
              newText: expectedMarkIndentation,
            });
            if (ch === "\n") {
              const cursorIndentRange = {
                start: {
                  line: position.line,
                  character: 0,
                },
                end: {
                  line: position.line,
                  character: position.character,
                },
              };
              const currentCursorIndentation =
                document.getText(cursorIndentRange);
              const expectedCursorIndentation = options.insertSpaces
                ? " ".repeat((braceIndentLevel + 1) * options.tabSize)
                : "\t".repeat(braceIndentLevel + 1);
              if (currentCursorIndentation !== expectedCursorIndentation) {
                result.push({
                  range: cursorIndentRange,
                  newText: expectedCursorIndentation,
                });
              }
            }
          }
        }
      }
    }
  }
  return result;
};
