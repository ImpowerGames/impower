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

const WHITESPACE_REGEX = /[\t ]*/;
const INDENT_REGEX: RegExp = /^[ \t]*/;

// Decision helpers for "should this zero-width mid-line separator
// synthesize a space?". The rules are asymmetric — `,` wants no space
// before but YES space after; `(` after a word is a function call (no
// space) but `(` after an operator is grouping (space). See trace
// table in `shouldInsertSpaceBetween` below.

// Right-side: nextChar = these → never insert space BEFORE them.
const NO_SPACE_BEFORE = new Set([")", "]", "}", ",", ";", ":", "."]);
// Left-side: prevChar = these → never insert space AFTER them.
const NO_SPACE_AFTER = new Set(["(", "[", "{", "."]);
// Openers that "attach" to a preceding word — `foo(`, `arr[`, `obj{`
// — but DON'T attach to a preceding operator (`a * (b)` wants space).
const CALL_LIKE_OPENERS = new Set(["(", "[", "{"]);

function isWordChar(c: string): boolean {
  return /[a-zA-Z0-9_]/.test(c);
}

function shouldInsertSpaceBetween(
  prevChar: string,
  nextChar: string,
): boolean {
  // If there's already a space on either side, don't synthesize
  // another one — the adjacent separator's normalize pass will
  // handle it. Without this guard, two zero-width-adjacent
  // separators (e.g. one trailing rule + one leading-`with` rule
  // both capture the same gap) would each insert and produce two
  // spaces between tokens.
  if (prevChar === " " || prevChar === "\t") return false;
  if (nextChar === " " || nextChar === "\t") return false;
  if (NO_SPACE_BEFORE.has(nextChar)) return false;
  if (NO_SPACE_AFTER.has(prevChar)) return false;
  if (CALL_LIKE_OPENERS.has(nextChar) && isWordChar(prevChar)) return false;
  return true;
}

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

  // Maps a "parent" block to the list of sibling clauses inside its
  // content that *visually replace* it. For an `else` keyword or its
  // body, the tree puts us inside `IfBlock_content`, but visually
  // we've popped out of the if-body and are starting a new sibling
  // at the IF's level. The ElseBlock/ElseifBlock contribution
  // SUPERSEDES the IfBlock_content contribution so we don't
  // double-count.
  const TRANSPARENT_OVERRIDES: Record<string, string[]> = {
    LuauSparkdownIfBlock: [
      "LuauSparkdownElseifBlock",
      "LuauSparkdownElseBlock",
    ],
    LuauIfBlock: ["LuauElseifBlock", "LuauElseBlock"],
    LuauSparkdownChooseBlock: ["LuauSparkdownChooseThenClause"],
  };

  const processBlockDeclaration = (
    stack: GrammarSyntaxNode<SparkdownNodeName>[],
    rootNodeName: SparkdownNodeName,
    contentNodeName: SparkdownNodeName,
    currentIndentation: string,
    currentIndentLevel: number,
    strict: boolean,
  ) => {
    // If any of this rule's transparent overrides is in the stack,
    // the override owns the indent contribution and this rule must
    // stay silent. Otherwise an `else` keyword would inherit the
    // IF-body indent on top of the ELSE-body indent.
    const overrides = TRANSPARENT_OVERRIDES[rootNodeName];
    if (overrides) {
      for (const o of overrides) {
        if (stack.some((n) => n?.name === o)) {
          return currentIndentLevel;
        }
      }
    }
    // `stack` is innermost-first: [leaf, ..., outermost]. So for a
    // given root at index i, its matching `_content` lives at an
    // *earlier* index (smaller i, deeper in the tree). Find every
    // (root, content?) pair so nested instances of the same rule
    // (nested if-blocks, choose inside choose, etc.) each contribute
    // their own indent level.
    const pairs: {
      rootNode: GrammarSyntaxNode<SparkdownNodeName>;
      contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined;
    }[] = [];
    for (let i = 0; i < stack.length; i++) {
      const rootNode = stack[i];
      if (!rootNode || rootNode.name !== rootNodeName) continue;
      // Walk toward the leaf looking for this root's `_content`.
      // Stop if we cross another instance of the same root (that's
      // a nested sibling, not this one's content).
      let contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined;
      for (let j = i - 1; j >= 0; j--) {
        const candidate = stack[j];
        if (!candidate) continue;
        if (candidate.name === rootNodeName) break;
        if (candidate.name === contentNodeName) {
          contentNode = candidate;
          break;
        }
      }
      pairs.push({ rootNode, contentNode });
    }
    if (pairs.length === 0) return currentIndentLevel;

    // Start from the current top of the indent stack — *including*
    // any `block_declaration` entries pushed by earlier
    // `processBlockDeclaration` calls in this same `processIndent`
    // pass. We want this call's contribution to STACK on top of those,
    // not replace them. (An if-block inside a function body should
    // contribute its own +1 on top of the function's +1, producing a
    // total of 2 levels of indent for the body content.)
    let level = indentStack.at(-1)?.level ?? 0;

    // For each nesting level: when this position is inside the
    // block's `_content`, indent +1. When the position is in the
    // block's `_begin`/`_end`, no contribution (the keyword line
    // stays at the parent's level).
    for (const { rootNode, contentNode } of pairs) {
      // In strict mode (the only mode we use today, since the
      // grammar's flexible-indent blocks were removed), every nested
      // block adds exactly +1 to the body indent regardless of how
      // the source already looked. The non-strict branch lives on
      // for future use.
      let indentOffset = 0;
      if (!strict) {
        const indentLevel = currentIndentation.includes("\t")
          ? currentIndentation.split("\t").length - 1
          : Math.round(currentIndentation.length / options.tabSize);
        const rootIndentNode = getDescendent("Indent", rootNode);
        const rootNodeIndentText = rootIndentNode
          ? document.read(rootIndentNode.from, rootIndentNode.to)
          : "";
        const rootNodeIndentLevel = rootNodeIndentText.includes("\t")
          ? rootNodeIndentText.split("\t").length - 1
          : Math.round(rootNodeIndentText.length / options.tabSize);
        indentOffset = indentLevel - rootNodeIndentLevel;
      }
      if (contentNode) level += indentOffset + 1;
    }
    level = Math.max(0, level);
    indent({ type: "block_declaration", level });
    return level;
  };

  const processIndent = (from: number, to: number) => {
    // The annotator emits a zero-width "indent" annotation immediately
    // after every Newline, marking the spot where the next line's
    // indentation should land. For the *final* newline that has no
    // line of content following it, we'd be writing indent whitespace
    // into a position that's about to be end-of-doc — pure noise that
    // produces ghost trailing-whitespace lines. Skip that case.
    if (from === to && from >= document.length) {
      return;
    }
    // Each `processIndent` rebuilds its own view of the tree at the
    // current position via the `processBlockDeclaration` calls below.
    // Entries pushed by the *previous* line's calls — and the
    // `choice_mark` frame the `cur` handler installed — are no longer
    // load-bearing (anything still in scope will push itself again on
    // this pass). Pop them so they don't compound. We deliberately
    // preserve `frontmatter` / `scene_begin` / `branch_begin` — those
    // are long-lived contexts emitted by separate annotators and not
    // re-derived per indent.
    while (
      indentStack.at(-1)?.type === "block_declaration" ||
      indentStack.at(-1)?.type === "choice_mark"
    ) {
      indentStack.pop();
    }
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
      // Luau block scopes. Each call pops any prior `block_declaration`
      // entries before reading the base level, so calling them in
      // outer-to-inner order makes the nested case (e.g. an
      // `LuauSparkdownElseBlock` inside `LuauSparkdownIfBlock_content`)
      // resolve to the right indent: the `else` / `elseif` / `end`
      // keyword lives at the *parent IfBlock's* level, while the
      // nested body lives one level deeper.
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauFunctionDefinition",
        "LuauFunctionDefinition_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownForLoop",
        "LuauSparkdownForLoop_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownWhileLoop",
        "LuauSparkdownWhileLoop_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownRepeatLoop",
        "LuauSparkdownRepeatLoop_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownDoBlock",
        "LuauSparkdownDoBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownIfBlock",
        "LuauSparkdownIfBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownElseifBlock",
        "LuauSparkdownElseifBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownElseBlock",
        "LuauSparkdownElseBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      // Non-Sparkdown Luau variants — these appear inside
      // `LuauFunctionDefinition_content` and other pure-Luau scopes
      // where the body can hold control flow without `&`-prefixed
      // statement markers.
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauForLoop",
        "LuauForLoop_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauWhileLoop",
        "LuauWhileLoop_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauRepeatLoop",
        "LuauRepeatLoop_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauDoBlock",
        "LuauDoBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauIfBlock",
        "LuauIfBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauElseifBlock",
        "LuauElseifBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauElseBlock",
        "LuauElseBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      // Sparkdown alternator + choose blocks. Same nested-children
      // pattern as the if/elseif/else case: `then` inside a `choose`
      // sits at the choose's level (not nested under choose_content).
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownChooseBlock",
        "LuauSparkdownChooseBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownChooseThenClause",
        "LuauSparkdownChooseThenClause_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownConditionalAlternatorBlock",
        "LuauSparkdownConditionalAlternatorBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauSparkdownSequentialAlternatorBlock",
        "LuauSparkdownSequentialAlternatorBlock_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      // Luau class-style `define ... end` and table literal
      // `{ ... }`. Body content is indented one level relative to
      // the opening keyword / brace line.
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauDefine",
        "LuauDefine_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "LuauTable",
        "LuauTable_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      // Sparkdown flow containers. The scene/branch declaration line
      // sits at the parent level (or root); their bodies are
      // indented one level deeper, so a `*`/`+` choice or a Luau
      // block inside the scene body inherits that +1.
      newIndentLevel = processBlockDeclaration(
        stack,
        "Scene",
        "Scene_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      newIndentLevel = processBlockDeclaration(
        stack,
        "Branch",
        "Branch_content",
        currentIndentation,
        newIndentLevel,
        true,
      );
      // FrontMatter field content are indented by 1
      const unknownNode = stack.find((n) => n.name === "Unknown");
      const frontMatterNode = stack.find((n) => n.name === "FrontMatter");
      if (frontMatterNode) {
        let indentLevel = Math.max(
          0,
          currentIndentation.includes("\t")
            ? currentIndentation.split("\t").length - 1
            : Math.round(currentIndentation.length / options.tabSize),
        );
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
    const validIndentLevel = Math.max(0, newIndentLevel);
    const expectedIndentation = options.insertSpaces
      ? " ".repeat(validIndentLevel * options.tabSize)
      : "\t".repeat(validIndentLevel);
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
      } else if (aheadCur.value.type === "scene_begin") {
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
      } else if (aheadCur.value.type === "choice_mark") {
        const text = document.read(aheadCur.from, aheadCur.to);
        const marks = text.split(WHITESPACE_REGEX).filter((m) => Boolean(m));
        if (marks.length > 0) {
          const top = indentStack.at(-1);
          // If the previous frame is a sibling choice_mark, REPLACE
          // it (siblings share the same indent slot). Otherwise PUSH
          // — we don't want to clobber a parent scene_begin /
          // branch_begin frame and lose its indent contribution for
          // the choice line.
          if (top?.type === "choice_mark") {
            const indentOffset =
              marks.length - (top.marks?.length ?? 0) - 1;
            const newIndentLevel = (top.level ?? 0) + indentOffset;
            setIndent({
              type: aheadCur.value.type,
              marks,
              level: Math.max(0, newIndentLevel),
            });
          } else {
            const parentLevel = top?.level ?? 0;
            indentStack.push({
              type: aheadCur.value.type,
              marks,
              level: parentLevel,
            });
          }
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
    } else if (cur.value.type === "separator") {
      // Zero-width separators are a no-op normalize but a candidate
      // insert. We insert only when the surrounding chars look like
      // an operator boundary (`x=1` → `x = 1`); we leave the
      // separator alone when it's at line start or when it sits
      // against attaching punctuation (`plural(cond)`, `obj.method`,
      // `foo(a,b)`).
      const isZeroWidth = cur.from === cur.to;
      let shouldSkip = false;
      if (isZeroWidth) {
        if (range.start.character === 0) {
          shouldSkip = true;
        } else {
          const nextChar = document.read(cur.to, cur.to + 1);
          const prevChar = document.read(cur.from - 1, cur.from);
          if (!shouldInsertSpaceBetween(prevChar, nextChar)) {
            shouldSkip = true;
          }
        }
      }
      if (!shouldSkip) {
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
    } else if (cur.value.type === "choice_mark") {
      // The preceding `processIndent` pushed `block_declaration`
      // entries for this line's tree-derived indent. Drop them so
      // they don't compound with the choice_mark frame.
      while (indentStack.at(-1)?.type === "block_declaration") {
        indentStack.pop();
      }
      const text = document.getText(range);
      const marks = text.split(WHITESPACE_REGEX).filter((m) => Boolean(m));
      // Bump the existing `choice_mark` frame (pushed by aheadCur)
      // to "body level" — content lines INSIDE the choice indent one
      // deeper than the choice line itself. We mutate the frame in
      // place rather than replacing the stack top so the parent
      // scene_begin / branch_begin frame below stays intact for the
      // NEXT sibling choice line.
      const top = indentStack.at(-1);
      if (top?.type === "choice_mark") {
        top.marks = marks;
        top.level = (top.level ?? 0) + 1;
      } else {
        const parentLevel = top?.level ?? 0;
        indentStack.push({
          type: cur.value.type,
          marks,
          level: parentLevel + 1,
        });
      }
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
    } else if (cur.value.type === "newline") {
      const range = document.range(cur.from, cur.to);
      const lineRange = document.getLineRange(range.start.line);
      const text = document.getText(lineRange);
      const prevLine = lines.at(-1);
      if (!text.trim()) {
        if (formattingOnType?.line !== range.start.line) {
          if (prevLine && !prevLine.text.trim()) {
            // Delete extra blank lines. `lineRange` covers just the
            // line's content (no trailing newline) — for a blank line
            // that's a zero-width range, which would no-op. Extend it
            // through the next-line start so the trailing `\n` is
            // included in the deletion.
            const deleteRange: Range = {
              start: lineRange.start,
              end: { line: lineRange.start.line + 1, character: 0 },
            };
            pushIfInRange({
              lineNumber: lineRange.start.line + 1,
              range: deleteRange,
              oldText: document.getText(deleteRange),
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
    // Only insert a final `\n` if the document doesn't already end in
    // one. The previous check used `lastLine.range.end.line <
    // lastPosition.line`, which is *true* even when the doc ends in a
    // single `\n` (`lastLine` ends just before that newline, on a
    // strictly lower line than `lastPosition`) — so it kept inserting
    // a redundant trailing blank line on every format pass.
    const lastChar =
      document.length > 0
        ? document.read(document.length - 1, document.length)
        : "";
    if (lastChar !== "\n" && lastChar !== "\r") {
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
      // Strip trailing *blank* lines only. The previous implementation
      // deleted any line whose end sat at `docLength - 1` (i.e. the
      // last content line), which silently ate the final line of every
      // single-line document.
      let lastLine = lines.pop();
      while (lastLine && !lastLine.text.trim()) {
        // Cover the line's trailing newline too — `lastLine.range`
        // (= `getLineRange(n)`) ends just before the `\n`, so on a
        // blank line it's zero-width and a no-op delete.
        const editRange: Range = {
          start: lastLine.range.start,
          end: { line: lastLine.range.start.line + 1, character: 0 },
        };
        pushIfInRange({
          lineNumber: editRange.start.line + 1,
          range: editRange,
          oldText: document.getText(editRange),
          newText: "",
          type: "newline",
        });
        lastLine = lines.pop();
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
        if (curr.type === "separator" && prev.type === "separator") {
          // combine separators
          if (
            document.offsetAt(curr.range.start) <
            document.offsetAt(prev.range.start)
          ) {
            prev.range.start = curr.range.start;
          }
          if (
            document.offsetAt(curr.range.end) >
            document.offsetAt(prev.range.end)
          ) {
            prev.range.end = curr.range.end;
          }
          continue;
        } else if (curr.type === "indent" && prev.type === "separator") {
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
          // Keep curr
          if (
            document.offsetAt(prev.range.start) <
            document.offsetAt(curr.range.start)
          ) {
            curr.range.start = prev.range.start;
          }
          if (
            document.offsetAt(prev.range.end) >
            document.offsetAt(curr.range.end)
          ) {
            curr.range.end = prev.range.end;
          }
          // Remove prev
          result.pop();
        } else if (prev.type === "separator" && curr.type === "extra") {
          // Separator takes precedence over extra
          // Keep prev
          if (
            document.offsetAt(curr.range.start) <
            document.offsetAt(prev.range.start)
          ) {
            prev.range.start = curr.range.start;
          }
          if (
            document.offsetAt(curr.range.end) >
            document.offsetAt(prev.range.end)
          ) {
            prev.range.end = curr.range.end;
          }
          // Don't add curr
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
    document,
    tree,
    annotations,
    options,
    formattingRange,
    formattingOnType,
  );

  const result = resolveFormattingConflicts(edits, document, formattingOnType);

  return result;
};
