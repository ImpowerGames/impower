import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";
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
import { type Range } from "vscode-languageserver-textdocument";

const WHITESPACE_REGEX = /[\t ]*/;

const isInRange = (
  document: SparkdownDocument,
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
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations | undefined,
  options: FormattingOptions,
  formattingRange?: Range,
  formattingOnType?: Position
): TextEdit[] | undefined => {
  if (!document || !annotations) {
    return undefined;
  }

  const edits: (TextEdit & {
    lineNumber: number;
    oldText: string;
    type: string;
  })[] = [];

  const indentStack: { type: string; marks?: string[]; level: number }[] = [
    { type: "", level: 0 },
  ];

  const pushIfInRange = (
    edit: TextEdit & { lineNumber: number; oldText: string; type: string }
  ) => {
    if (
      formattingOnType ||
      !formattingRange ||
      isInRange(document, edit.range, formattingRange)
    ) {
      edits.push(edit);
    }
  };

  const resetIndent = () => {
    indentStack.length = 0;
    const indent = { type: "", level: 0 };
    indentStack.push(indent);
  };

  const setIndent = (indent: {
    type: string;
    marks?: string[];
    level: number;
  }) => {
    indentStack[indentStack.length - 1] = indent;
  };

  const indent = (indent: {
    type: string;
    marks?: string[];
    level?: number;
  }) => {
    let newIndentLevel =
      indent.level == null
        ? (indentStack.at(-1)?.level ?? 0) + 1
        : indent.level;
    indentStack.push({ type: indent.type, level: newIndentLevel });
  };

  const outdent = () => {
    indentStack.pop();
  };

  const cur = annotations.formatting?.iter();
  const aheadCur = annotations.formatting?.iter();
  aheadCur.next();
  if (cur) {
    let lines: { range: Range; text: string }[] = [];
    while (cur.value) {
      // Lookahead in case we need to indent or outdent a certain type of node
      if (aheadCur.value) {
        if (aheadCur.value.type === "close_brace") {
          outdent();
        } else if (
          aheadCur.value.type === "root" ||
          aheadCur.value.type === "knot_begin" ||
          aheadCur.value.type === "define_begin" ||
          aheadCur.value.type === "define_end" ||
          aheadCur.value.type === "frontmatter_begin" ||
          aheadCur.value.type === "frontmatter_end"
        ) {
          resetIndent();
        } else if (
          aheadCur.value.type === "case_mark" ||
          aheadCur.value.type === "alternative_mark"
        ) {
          outdent();
        } else if (
          aheadCur.value.type === "choice_mark" ||
          aheadCur.value.type === "gather_mark"
        ) {
          const text = document.read(aheadCur.from, aheadCur.to);
          const marks = text.split(WHITESPACE_REGEX).filter((m) => Boolean(m));
          if (marks.length > 0) {
            const currentIndent = indentStack.at(-1);
            const indentOffset =
              marks.length - (currentIndent?.marks?.length ?? 0) - 1;
            const newIndentLevel =
              currentIndent?.type === "choice_mark" ||
              currentIndent?.type === "gather_mark"
                ? (currentIndent?.level ?? 0) + indentOffset
                : currentIndent?.level ?? 0;
            setIndent({
              type: aheadCur.value.type,
              marks,
              level: Math.max(0, newIndentLevel),
            });
          }
        }
      }
      // Process current
      const range = document.range(cur.from, cur.to);
      if (cur.value.type === "indent") {
        let currentIndentation = document.read(cur.from, cur.to);
        const currentIndent = indentStack.at(-1);
        let newIndentLevel = currentIndent?.level ?? 0;
        if (tree) {
          const stack = getStack<SparkdownNodeName>(tree, cur.from, 1);
          // Define properties are indented relative to DefineDeclaration node
          const defineNode = stack.find((n) => n.name === "DefineDeclaration");
          if (defineNode) {
            const defineContentNode = stack.find(
              (n) => n.name === "DefineDeclaration_content"
            );
            let indentLevel = currentIndentation.includes("\t")
              ? currentIndentation.split("\t").length - 1
              : Math.round(currentIndentation.length / options.tabSize);
            const defineIndentNode = getDescendent("Indent", defineNode);
            const defineNodeIndentText = defineIndentNode
              ? document.read(defineIndentNode.from, defineIndentNode.to)
              : "";
            const defineNodeIndentLevel = defineNodeIndentText.includes("\t")
              ? defineNodeIndentText.split("\t").length - 1
              : Math.round(defineNodeIndentText.length / options.tabSize);
            const indentOffset = indentLevel - defineNodeIndentLevel + 1;
            const minLevel = defineContentNode ? 1 : 0;
            newIndentLevel = Math.max(minLevel, indentOffset);
            setIndent({ type: "define", level: newIndentLevel });
          }
          // FrontMatter field content are indented by 1
          const unknownNode = stack.find((n) => n.name === "Unknown");
          const frontMatterNode = stack.find((n) => n.name === "FrontMatter");
          if (frontMatterNode) {
            let indentLevel = currentIndentation.includes("\t")
              ? currentIndentation.split("\t").length - 1
              : Math.round(currentIndentation.length / options.tabSize);
            const frontMatterFieldContentNode = stack.find(
              (n) => n.name === "FrontMatterField_content"
            );
            newIndentLevel = unknownNode
              ? indentLevel
              : frontMatterFieldContentNode
              ? 1
              : 0;
            setIndent({ type: "frontmatter", level: newIndentLevel });
          }
        }
        const expectedIndentation = options.insertSpaces
          ? " ".repeat(newIndentLevel * options.tabSize)
          : "\t".repeat(newIndentLevel);
        if (currentIndentation !== expectedIndentation) {
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: expectedIndentation,
            type: cur.value.type,
          });
        }
      } else if (cur.value.type === "open_brace") {
        indent({ type: cur.value.type });
      } else if (cur.value.type === "separator") {
        const text = document.getText(range);
        const expectedText = " ";
        if (text !== expectedText) {
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: expectedText,
            type: cur.value.type,
          });
        }
      } else if (cur.value.type === "extra") {
        const text = document.getText(range);
        const expectedText = "";
        if (text !== expectedText) {
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: expectedText,
            type: cur.value.type,
          });
        }
      } else if (cur.value.type === "trailing") {
        const text = document.getText(range);
        const expectedText = "";
        if (options.trimTrailingWhitespace && text !== expectedText) {
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: expectedText,
            type: cur.value.type,
          });
        }
      } else if (
        cur.value.type === "case_mark" ||
        cur.value.type === "alternative_mark"
      ) {
        indent({ type: cur.value.type });
      } else if (
        cur.value.type === "choice_mark" ||
        cur.value.type === "gather_mark"
      ) {
        const text = document.getText(range);
        const marks = text.split(WHITESPACE_REGEX).filter((m) => Boolean(m));
        const currentIndent = indentStack.at(-1);
        const newIndentLevel = (currentIndent?.level ?? 0) + 1;
        setIndent({ type: cur.value.type, marks, level: newIndentLevel });
        const expectedText = marks.join(" ") + " ";
        if (text !== expectedText) {
          // Omit first char to avoid overlapping with indent edits
          const editRange = {
            start: {
              line: range.start.line,
              character: range.start.character + 1,
            },
            end: range.end,
          };
          pushIfInRange({
            lineNumber: editRange.start.line + 1,
            range: editRange,
            oldText: document.getText(editRange),
            newText: expectedText.slice(1),
            type: cur.value.type,
          });
        }
      } else if (cur.value.type === "knot_begin") {
        const text = document.getText(range);
        const expectedText = "== ";
        if (text !== expectedText) {
          // Omit first char to avoid overlapping with indent edits
          const editRange = {
            start: {
              line: range.start.line,
              character: range.start.character + 1,
            },
            end: range.end,
          };
          pushIfInRange({
            lineNumber: editRange.start.line + 1,
            range: editRange,
            oldText: document.getText(editRange),
            newText: expectedText.slice(1),
            type: cur.value.type,
          });
        }
      } else if (cur.value.type === "knot_end") {
        const text = document.getText(range);
        const expectedText = " ==";
        if (text !== expectedText) {
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: expectedText,
            type: cur.value.type,
          });
        }
      } else if (cur.value.type === "newline") {
        const range = document.range(cur.from, cur.to);
        const lineRange = document.getLineRange(range.start.line);
        const text = document.getText(lineRange);
        const prevLine = lines.at(-1);
        if (!text.trim()) {
          if (!formattingOnType) {
            if (prevLine && !prevLine.text.trim()) {
              // Delete extra blank lines
              pushIfInRange({
                lineNumber: lineRange.start.line + 1,
                range: lineRange,
                oldText: document.getText(lineRange),
                newText: "",
                type: "blankline",
              });
            } else if (text.length > 0) {
              // Delete extra whitespace
              pushIfInRange({
                lineNumber: lineRange.start.line + 1,
                range: {
                  start: lineRange.start,
                  end: {
                    line: lineRange.start.line,
                    character: text.length,
                  },
                },
                oldText: document.getText(lineRange),
                newText: "",
                type: "extra",
              });
            }
          }
        }
        lines.push({ text, range: lineRange });
      }
      cur.next();
      aheadCur.next();
    }

    // console.log("LINES", [...lines]);

    const lastPosition = document.positionAt(Number.MAX_VALUE);

    if (!formattingOnType) {
      if (options.insertFinalNewline) {
        const lastLine = lines.at(-1);
        if (!lastLine || lastLine.range.end.line < lastPosition.line) {
          const editRange = {
            start: lastPosition,
            end: lastPosition,
          };
          pushIfInRange({
            lineNumber: editRange.start.line + 1,
            range: editRange,
            oldText: document.getText(editRange),
            newText: "\n",
            type: "newline",
          });
        }
      }

      if (options.trimFinalNewlines) {
        let lastLine = lines.pop();
        let docLength = document.length;
        while (
          lastLine &&
          document.offsetAt(lastLine.range.end) === docLength - 1
        ) {
          const editRange = lastLine.range;
          pushIfInRange({
            lineNumber: editRange.start.line + 1,
            range: editRange,
            oldText: document.getText(editRange),
            newText: "",
            type: "newline",
          });
          lastLine = lines.pop();
          docLength -= 1;
        }
      }
    }
  }

  edits.sort(
    (a, b) =>
      document.offsetAt(a.range.start) - document.offsetAt(b.range.start)
  );

  // console.log("EDITS", edits);

  const result: (TextEdit & { type: string })[] = [];
  for (let i = 0; i < edits.length; i++) {
    const curr = edits[i]!;
    const prev = result.at(-1)!;
    if (prev) {
      const currFrom = document.offsetAt(curr.range.start);
      const prevTo = document.offsetAt(prev.range.end);
      const prevFrom = document.offsetAt(prev.range.start);
      const currOldText = document.getText(curr.range);
      const prevOldText = document.getText(prev.range);
      if (prevTo >= currFrom) {
        // Overlap detected
        if (curr.type === "indent" && prev.type === "separator") {
          // Indent takes precedence over separator
          result.pop();
        } else if (prev.type === "indent" && curr.type === "separator") {
          // Indent takes precedence over separator
          continue;
        } else if (curr.type === "indent" && prev.type === "extra") {
          // Indent takes precedence over separator
          result.pop();
        } else if (prev.type === "indent" && curr.type === "extra") {
          // Indent takes precedence over separator
          continue;
        } else if (curr.type === "separator" && prev.type === "extra") {
          // Separator takes precedence over extra
          result.pop();
        } else if (prev.type === "separator" && curr.type === "extra") {
          // Separator takes precedence over extra
          continue;
        } else if (curr.type === "blankline" && prev.type === "indent") {
          // Delete blank line and add indent
          curr.range.start = prev.range.start;
          if (
            document.getLineText(prev.range.start.line).trim() ||
            formattingOnType
          ) {
            curr.newText += prev.newText;
          }
          result.pop();
        } else if (prev.type === "blankline" && curr.type === "indent") {
          // Delete blank line and add indent
          prev.range.end = curr.range.end;
          if (
            document.getLineText(curr.range.start.line).trim() ||
            formattingOnType
          ) {
            prev.newText += curr.newText;
          }
          continue;
        } else if (curr.type === "blankline" && prev.type === "separator") {
          // Deleting blank line takes precedence over separator
          result.pop();
        } else if (prev.type === "blankline" && curr.type === "separator") {
          // Deleting blank line takes precedence over separator
          continue;
        } else if (prevTo === currFrom) {
          // Combine consecutive edits
          prev.newText += curr.newText;
          prev.range.end = curr.range.end;
          continue;
        } else {
          // Couldn't resolve the conflict!
          console.error(
            "ERROR:",
            JSON.stringify({
              line: prev.range.start.line + 1,
              offset: prevFrom,
              oldText: prevOldText,
              newText: prev.newText,
              type: prev.type,
            }),
            " overlaps with ",
            JSON.stringify({
              line: curr.range.start.line + 1,
              offset: currFrom,
              oldText: currOldText,
              newText: curr.newText,
              type: curr.type,
            })
          );
          continue;
        }
      }
    }
    result.push({ range: curr.range, newText: curr.newText, type: curr.type });
  }

  // console.log("RESULT", result);

  return result;
};
