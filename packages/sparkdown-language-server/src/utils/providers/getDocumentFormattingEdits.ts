import { FormatType } from "@impower/sparkdown/src/compiler/classes/annotators/FormattingAnnotator";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { getStack } from "@impower/textmate-grammar-tree/src/tree/utils/getStack";
import { Tree } from "@lezer/common";
import {
  type FormattingOptions,
  type Position,
  type TextEdit,
} from "vscode-languageserver";
import { type Range } from "vscode-languageserver-textdocument";
import { SparkdownConfiguration } from "../../types/SparkdownConfiguration";

const WHITESPACE_REGEX = /[\t ]*/;
const INDENT_REGEX: RegExp = /^[ \t]*/;

const isInRange = (
  document: SparkdownDocument,
  innerRange: Range,
  outerRange: Range | Position,
) => {
  if ("start" in outerRange) {
    return (
      document.offsetAt(innerRange.start) >=
        document.offsetAt(outerRange.start) &&
      document.offsetAt(innerRange.end) <= document.offsetAt(outerRange.end)
    );
  }
  return document.offsetAt(innerRange.start) >= document.offsetAt(outerRange);
};

export const getFormatting = (
  settings: SparkdownConfiguration | undefined,
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations,
  options: FormattingOptions,
  formattingRange?: Range | Position,
  formattingOnType?: Position,
) => {
  const edits: (TextEdit & {
    lineNumber: number;
    oldText: string;
    type: string;
  })[] = [];

  if (!document) {
    return {};
  }

  const lines: { range: Range; text: string }[] = [];

  const indentStack: {
    type: FormatType;
    marks?: string[];
    level: number;
  }[] = [];

  let tempIndentLevel: number | undefined = undefined;
  let matchNextIndentLevel: { from: number; to: number } | undefined =
    undefined;
  let indentsToProcessLater: { from: number; to: number }[] = [];

  const pushIfInRange = (
    edit: TextEdit & { lineNumber: number; oldText: string; type: string },
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
  };

  const setIndent = (indent: {
    type: FormatType;
    marks?: string[];
    level: number;
  }) => {
    indentStack[Math.max(0, indentStack.length - 1)] = indent;
  };

  const indent = (indent: {
    type: FormatType;
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

  const processBlockDeclaration = (
    stack: GrammarSyntaxNode<SparkdownNodeName>[],
    rootNodeName: SparkdownNodeName,
    contentNodeName: SparkdownNodeName,
    currentIndentation: string,
    currentIndentLevel: number,
    strict: boolean,
  ) => {
    const rootNode = stack.find((n) => n.name === rootNodeName);
    if (rootNode) {
      const declarationIndentStack = [...indentStack];
      while (declarationIndentStack.at(-1)?.type === "block_declaration") {
        declarationIndentStack.pop();
      }
      const expectedRootIndentLevel = declarationIndentStack.at(-1)?.level ?? 0;
      const contentNode = stack.find((n) => n.name === contentNodeName);
      let indentLevel = currentIndentation.includes("\t")
        ? currentIndentation.split("\t").length - 1
        : Math.round(currentIndentation.length / options.tabSize);
      const rootIndentNode = getDescendent("Indent", rootNode);
      const rootNodeIndentText = rootIndentNode
        ? document.read(rootIndentNode.from, rootIndentNode.to)
        : "";
      const rootNodeIndentLevel = rootNodeIndentText.includes("\t")
        ? rootNodeIndentText.split("\t").length - 1
        : Math.round(rootNodeIndentText.length / options.tabSize);
      const indentOffset = strict ? 0 : indentLevel - rootNodeIndentLevel;
      currentIndentLevel = contentNode
        ? expectedRootIndentLevel + indentOffset + 1
        : expectedRootIndentLevel;
      indent({ type: "block_declaration", level: currentIndentLevel });
      return currentIndentLevel;
    }
    return currentIndentLevel;
  };

  const processIndent = (from: number, to: number) => {
    const range = document.range(from, to);
    let text = document.read(from, to);
    const indentMatch = text.match(INDENT_REGEX);
    const currentIndentation = indentMatch?.[0] || "";
    const indentRange = {
      start: {
        line: range.start.line,
        character: range.start.character,
      },
      end: {
        line: range.start.line,
        character: currentIndentation.length,
      },
    };

    const currentIndent = indentStack.at(-1);
    let newIndentLevel = tempIndentLevel ?? currentIndent?.level ?? 0;
    tempIndentLevel = undefined;
    if (tree) {
      const stack = getStack<SparkdownNodeName>(tree, from, 1);
      // Block Declaration properties are indented relative to root node
      newIndentLevel = processBlockDeclaration(
        stack,
        "DefineViewDeclaration",
        "DefineViewDeclaration_content",
        currentIndentation,
        newIndentLevel,
        false,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "DefineStylingDeclaration",
        "DefineStylingDeclaration_content",
        currentIndentation,
        newIndentLevel,
        false,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "DefinePlainDeclaration",
        "DefinePlainDeclaration_content",
        currentIndentation,
        newIndentLevel,
        false,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "BlockTitle",
        "BlockTitle_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "BlockHeading",
        "BlockHeading_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "BlockTransitional",
        "BlockTransitional_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "BlockWrite",
        "BlockWrite_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "BlockDialogue",
        "BlockDialogue_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "BlockAction",
        "BlockAction_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      // FrontMatter field content are indented by 1
      const unknownNode = stack.find((n) => n.name === "Unknown");
      const frontMatterNode = stack.find((n) => n.name === "FrontMatter");
      if (frontMatterNode) {
        let indentLevel = currentIndentation.includes("\t")
          ? currentIndentation.split("\t").length - 1
          : Math.round(currentIndentation.length / options.tabSize);
        const frontMatterFieldContentNode = stack.find(
          (n) => n.name === "FrontMatterField_content",
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
        lineNumber: indentRange.start.line + 1,
        range: indentRange,
        oldText: document.getText(indentRange),
        newText: expectedIndentation,
        type: "indent",
      });
    }
  };

  const cur = annotations.formatting.iter();
  const aheadCur = annotations.formatting.iter();
  const formattingTo = formattingRange
    ? "end" in formattingRange
      ? document.offsetAt(formattingRange.end)
      : document.length
    : undefined;
  aheadCur.next();
  while (cur.value) {
    if (formattingTo != null && cur.from > formattingTo) {
      break;
    }
    // Lookahead in case we need to indent or outdent a certain type of node
    while (aheadCur.value) {
      if (aheadCur.value.type === "sol_comment") {
        // Start of line comments are generally associated with the next non-blank line
        // So have them match the indentation of the next non-blank line
        if (!matchNextIndentLevel) {
          matchNextIndentLevel = { from: aheadCur.from, to: aheadCur.to };
        }
        let line = document.range(aheadCur.from, aheadCur.to).end.line;
        if (!document.getLineText(line + 1).trim()) {
          line += 1;
          while (
            line < document.lineCount &&
            !document.getLineText(line).trim()
          ) {
            line += 1;
          }
          matchNextIndentLevel.to = document.offsetAt(
            document.getLineRange(line - 1).end,
          );
        }
      } else if (aheadCur.value.type === "close_brace") {
        outdent();
      } else if (aheadCur.value.type === "function_begin") {
        resetIndent();
      } else if (aheadCur.value.type === "scene_begin") {
        resetIndent();
      } else if (aheadCur.value.type === "knot_begin") {
        resetIndent();
      } else if (aheadCur.value.type === "block_declaration_end") {
        while (indentStack.at(-1)?.type === "block_declaration") {
          indentStack.pop();
        }
      } else if (aheadCur.value.type === "frontmatter_end") {
        while (indentStack.at(-1)?.type === "frontmatter") {
          indentStack.pop();
        }
      } else if (aheadCur.value.type === "branch_begin") {
        resetIndent();
        indent({ type: aheadCur.value.type });
      } else if (aheadCur.value.type === "stitch_begin") {
        resetIndent();
        indent({ type: aheadCur.value.type });
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
          const newIndentLevel = (currentIndent?.level ?? 0) + indentOffset;
          setIndent({
            type: aheadCur.value.type,
            marks,
            level: Math.max(0, newIndentLevel),
          });
        }
      }
      break;
    }

    // Process current
    const range = document.range(cur.from, cur.to);
    if (cur.value.type === "indent") {
      if (!matchNextIndentLevel || cur.from >= matchNextIndentLevel.to) {
        for (const indent of indentsToProcessLater) {
          processIndent(indent.from, indent.to);
        }
        processIndent(cur.from, cur.to);
        matchNextIndentLevel = undefined;
        indentsToProcessLater.length = 0;
      } else if (matchNextIndentLevel) {
        indentsToProcessLater.push({ from: cur.from, to: cur.to });
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
    } else if (cur.value.type === "indenting_colon") {
      const currentIndent = indentStack.at(-1);
      const newIndentLevel = (currentIndent?.level ?? 0) + 1;
      setIndent({
        type: currentIndent?.type ?? cur.value.type,
        marks: currentIndent?.marks,
        level: newIndentLevel,
      });
    } else if (cur.value.type === "eol_divert") {
      if (
        !document
          .getLineText(document.range(cur.from, cur.to).start.line + 1)
          .trim()
      ) {
        // If next line is blank, unindent only it
        const currentIndent = indentStack.at(-1);
        const newIndentLevel = Math.max(0, (currentIndent?.level ?? 0) - 1);
        tempIndentLevel = newIndentLevel;
      }
    } else if (cur.value.type === "optional_mark") {
      if (settings?.formatter?.convertInkSyntaxToSparkdownSyntax) {
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
      }
    } else if (cur.value.type === "keyword") {
      if (settings?.formatter?.convertInkSyntaxToSparkdownSyntax) {
        const text = document.getText(range);
        const expectedText = text.toLowerCase();
        if (text !== expectedText) {
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: expectedText,
            type: cur.value.type,
          });
        }
      }
    } else if (cur.value.type === "function_begin") {
      indent({ type: cur.value.type });
    } else if (cur.value.type === "function_end") {
      const text = document.getText(range);
      const expectedText = ":";
      if (text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
    } else if (cur.value.type === "scene_begin") {
      indent({ type: cur.value.type });
    } else if (cur.value.type === "scene_end") {
      const text = document.getText(range);
      const expectedText = ":";
      if (text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
    } else if (cur.value.type === "knot_begin") {
      const text = document.getText(range);
      const restOfLineText = document
        .getLineText(range.start.line)
        .slice(text.length);
      const isFunctionKnot = /function($|[ \t]*)/.test(
        restOfLineText.trimStart(),
      );
      const expectedText = settings?.formatter
        ?.convertInkSyntaxToSparkdownSyntax
        ? isFunctionKnot
          ? ""
          : "scene "
        : "== ";
      if (text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
      indent({ type: cur.value.type });
    } else if (cur.value.type === "knot_end") {
      const text = document.getText(range);
      const expectedText = settings?.formatter
        ?.convertInkSyntaxToSparkdownSyntax
        ? ":"
        : " ==";
      if (text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
    } else if (cur.value.type === "branch_begin") {
      indent({ type: cur.value.type });
    } else if (cur.value.type === "branch_end") {
      const text = document.getText(range);
      const expectedText = ":";
      if (text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
    } else if (cur.value.type === "stitch_begin") {
      const text = document.getText(range);
      const expectedText = settings?.formatter
        ?.convertInkSyntaxToSparkdownSyntax
        ? "branch"
        : "=";
      if (text !== expectedText) {
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: expectedText,
          type: cur.value.type,
        });
      }
      indent({ type: cur.value.type });
    } else if (cur.value.type === "stitch_end") {
      const text = document.getText(range);
      const expectedText = settings?.formatter
        ?.convertInkSyntaxToSparkdownSyntax
        ? ":"
        : "";
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
        if (formattingOnType?.line !== range.start.line) {
          if (prevLine && !prevLine.text.trim()) {
            // Delete extra blank lines
            pushIfInRange({
              lineNumber: lineRange.start.line + 1,
              range: lineRange,
              oldText: document.getText(lineRange),
              newText: "",
              type: "blankline",
            });
          }
        }
      }
      lines.push({ text, range: lineRange });
    }
    cur.next();
    aheadCur.next();
  }

  const lastPosition = document.positionAt(Number.MAX_VALUE);

  if (
    options.insertFinalNewline &&
    formattingOnType?.line !== lastPosition.line
  ) {
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

  edits.sort(
    (a, b) =>
      document.offsetAt(a.range.start) - document.offsetAt(b.range.start),
  );

  return {
    edits,
    lines,
    indentStack,
    indentLevel: indentStack.at(-1)?.level ?? 0,
  };
};

export const resolveFormattingConflicts = (
  edits: (TextEdit & { type: string })[] | undefined,
  document: SparkdownDocument,
  formattingOnType?: Position,
): TextEdit[] => {
  const result: (TextEdit & { type: string })[] = [];
  if (!edits) {
    return result;
  }
  for (let i = 0; i < edits.length; i++) {
    const curr = structuredClone(edits[i])!;
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
          // Indent takes precedence over extra
          result.pop();
        } else if (prev.type === "indent" && curr.type === "extra") {
          // Indent takes precedence over extra
          continue;
        } else if (curr.type === "separator" && prev.type === "extra") {
          // Separator takes precedence over extra
          result.pop();
        } else if (prev.type === "separator" && curr.type === "extra") {
          // Separator takes precedence over extra
          continue;
        } else if (curr.type === "blankline" && prev.type === "indent") {
          // Delete blank line and add indent
          if (
            document.offsetAt(prev.range.start) <
            document.offsetAt(curr.range.start)
          ) {
            curr.range.start = prev.range.start;
          }
          if (
            document.getLineText(prev.range.start.line).trim() ||
            formattingOnType
          ) {
            curr.newText += prev.newText;
          }
          result.pop();
        } else if (prev.type === "blankline" && curr.type === "indent") {
          // Delete blank line and add indent
          if (
            document.offsetAt(curr.range.end) >
            document.offsetAt(prev.range.end)
          ) {
            prev.range.end = curr.range.end;
          }
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
        } else if (curr.newText === "" && prev.newText === "") {
          // Combine overlapping deletion edits
          prev.range.end = curr.range.end;
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
            }),
          );
          continue;
        }
      }
    }
    result.push({ range: curr.range, newText: curr.newText, type: curr.type });
  }

  return result;
};

export const getDocumentFormattingEdits = (
  settings: SparkdownConfiguration | undefined,
  document: SparkdownDocument | undefined,
  tree: Tree | undefined,
  annotations: SparkdownAnnotations | undefined,
  options: FormattingOptions,
  formattingRange?: Range | Position,
  formattingOnType?: Position,
): TextEdit[] | undefined => {
  if (!document || !annotations) {
    return undefined;
  }

  const { edits, lines } = getFormatting(
    settings,
    document,
    tree,
    annotations,
    options,
    formattingRange,
    formattingOnType,
  );

  // console.log("LINES", [...lines]);

  // console.log("EDITS", edits);

  const result = resolveFormattingConflicts(edits, document, formattingOnType);

  // console.log("RESULT", result);

  return result;
};
