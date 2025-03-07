import { SparkdownAnnotations } from "@impower/sparkdown/src/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/classes/SparkdownDocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/types/SparkdownNodeName";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { Tree } from "@lezer/common";
import { type FormattingOptions, type TextEdit } from "vscode-languageserver";
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
  formattingRange?: Range
): TextEdit[] | undefined => {
  if (!document || !annotations) {
    return undefined;
  }

  const edits: TextEdit[] = [];

  const indentStack: { type: string; marks?: string[]; level: number }[] = [
    { type: "", level: 0 },
  ];

  const pushIfInRange = (edit: TextEdit) => {
    if (!formattingRange || isInRange(document, edit.range, formattingRange)) {
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
    let newlineRanges: Range[] = [];
    while (cur.value) {
      // Lookahead in case we need to indent or outdent a certain type of node
      if (aheadCur.value?.type === "close_brace") {
        outdent();
      } else if (
        aheadCur.value?.type === "root" ||
        aheadCur.value?.type === "knot_begin" ||
        aheadCur.value?.type === "define_begin" ||
        aheadCur.value?.type === "define_end" ||
        aheadCur.value?.type === "frontmatter_begin" ||
        aheadCur.value?.type === "frontmatter_end"
      ) {
        resetIndent();
      } else if (
        aheadCur.value?.type === "case_mark" ||
        aheadCur.value?.type === "alternative_mark"
      ) {
        outdent();
      } else if (
        aheadCur.value?.type === "choice_mark" ||
        aheadCur.value?.type === "gather_mark"
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
            range,
            newText: expectedIndentation,
          });
        }
      } else if (cur.value.type === "open_brace") {
        indent({ type: cur.value.type });
      } else if (cur.value.type === "separator") {
        const text = document.getText(range);
        const expectedText = " ";
        if (text !== expectedText) {
          pushIfInRange({
            range,
            newText: expectedText,
          });
        }
      } else if (cur.value.type === "extra") {
        const text = document.getText(range);
        const expectedText = "";
        if (text !== expectedText) {
          pushIfInRange({
            range,
            newText: expectedText,
          });
        }
      } else if (cur.value.type === "trailing") {
        const text = document.getText(range);
        const expectedText = "";
        if (options.trimTrailingWhitespace && text !== expectedText) {
          pushIfInRange({
            range,
            newText: expectedText,
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
          pushIfInRange({
            range: {
              start: {
                line: range.start.line,
                character: range.start.character + 1,
              },
              end: range.end,
            },
            newText: expectedText.slice(1),
          });
        }
      } else if (cur.value.type === "knot_begin") {
        const text = document.getText(range);
        const expectedText = "== ";
        if (text !== expectedText) {
          // Omit first char to avoid overlapping with indent edits
          pushIfInRange({
            range: {
              start: {
                line: range.start.line,
                character: range.start.character + 1,
              },
              end: range.end,
            },
            newText: expectedText.slice(1),
          });
        }
      } else if (cur.value.type === "knot_end") {
        const text = document.getText(range);
        const expectedText = " ==";
        if (text !== expectedText) {
          pushIfInRange({
            range,
            newText: expectedText,
          });
        }
      } else if (cur.value.type === "newline") {
        newlineRanges.push(range);
      }
      cur.next();
      aheadCur.next();
    }

    const lastPosition = document.positionAt(Number.MAX_VALUE);

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
      let docLength = document.length;
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
    if (i - 1 >= 0) {
      const curr = edits[i]!;
      const prev = edits[i - 1]!;
      const currFrom = document.offsetAt(curr.range.start);
      const prevTo = document.offsetAt(prev.range.end);
      const prevFrom = document.offsetAt(prev.range.start);
      const currOldText = document.getText(curr.range);
      const prevOldText = document.getText(prev.range);
      if (currFrom <= prevTo) {
        if (currFrom === prevTo) {
          // combine edits
          if (currOldText === "" && prevOldText === "") {
            console.warn(
              "ADDING ONTO PREVIOUS EDIT",
              JSON.stringify({
                line: curr.range.start.line + 1,
                offset: currFrom,
                oldText: currOldText,
                newText: edits[i]?.newText,
              }),
              " overlaps with ",
              JSON.stringify({
                line: prev.range.start.line + 1,
                offset: prevFrom,
                oldText: prevOldText,
                newText: edits[i - 1]?.newText,
              })
            );
            edits[i - 1]!.newText += curr.newText;
          }
        } else {
          console.error(
            "ERROR:",
            JSON.stringify({
              line: curr.range.start.line + 1,
              offset: currFrom,
              oldText: currOldText,
              newText: edits[i]?.newText,
            }),
            " overlaps with ",
            JSON.stringify({
              line: prev.range.start.line + 1,
              offset: prevFrom,
              oldText: prevOldText,
              newText: edits[i - 1]?.newText,
            })
          );
        }
        return false;
      }
    }
    return true;
  });

  return result;
};
