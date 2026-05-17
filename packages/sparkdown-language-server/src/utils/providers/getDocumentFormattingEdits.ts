import { FormatType } from "@impower/sparkdown/src/compiler/classes/annotators/FormattingAnnotator";
import { SparkdownAnnotations } from "@impower/sparkdown/src/compiler/classes/SparkdownCombinedAnnotator";
import { SparkdownDocument } from "@impower/sparkdown/src/compiler/classes/SparkdownDocument";
import { SparkdownNodeName } from "@impower/sparkdown/src/compiler/types/SparkdownNodeName";
import { GrammarSyntaxNode } from "@impower/textmate-grammar-tree/src/tree/types/GrammarSyntaxNode";
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
  if (prevChar === " " || prevChar === "\t") return false;
  if (nextChar === " " || nextChar === "\t") return false;
  if (NO_SPACE_BEFORE.has(nextChar)) return false;
  if (NO_SPACE_AFTER.has(prevChar)) return false;
  if (CALL_LIKE_OPENERS.has(nextChar) && isWordChar(prevChar)) return false;
  return true;
}

// Every grammar rule that visually indents its body content by one level.
// The body is recognized as the `_content` child of the named root —
// e.g. `LuauSparkdownIfBlock_content`. The header / footer (`_begin` /
// `_end`) stays at the parent level, so the closing `end` keyword
// aligns with the opening `if`.
const INDENTING_BLOCKS = new Set<SparkdownNodeName>([
  "BlockTitle",
  "BlockHeading",
  "BlockTransitional",
  "BlockWrite",
  "BlockDialogue",
  "BlockAction",
  "LuauFunctionDefinition",
  // `for`/`while`/`repeat` loops are NOT in this set: their grammar
  // rules end at `$` / `until`, so the inner `DoBlock` (which owns
  // the visible `end` keyword) is what we count. Listing both the
  // loop and the DoBlock would double-indent.
  "LuauSparkdownRepeatLoop",
  "LuauSparkdownDoBlock",
  "LuauSparkdownIfBlock",
  "LuauSparkdownElseifBlock",
  "LuauSparkdownElseBlock",
  "LuauRepeatLoop",
  "LuauDoBlock",
  "LuauIfBlock",
  "LuauElseifBlock",
  "LuauElseBlock",
  "LuauSparkdownChooseBlock",
  "LuauSparkdownChooseThenClause",
  "LuauSparkdownConditionalAlternatorBlock",
  "LuauSparkdownSequentialAlternatorBlock",
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorBlock",
  "LuauDefine",
  "LuauMethodDefinition",
  "LuauTable",
  "LuauParenthetical",
  // NOTE: `Scene` and `Branch` end at the colon — they're single-line
  // tree nodes, not body wrappers. Their indent contributions are
  // tracked via `sceneActive` / `branchActive` state (see below)
  // since the body lines are top-level siblings in the tree.
] as SparkdownNodeName[]);

// When a sibling clause (`else`, `elseif`, `then` after a `choose`)
// shows up inside the parent block's body, the parent's contribution
// is replaced by the sibling's own — otherwise both would stack and
// the clause body would indent +1 too deep.
const SIBLING_CLAUSES: Record<string, string[]> = {
  LuauSparkdownIfBlock: [
    "LuauSparkdownElseifBlock",
    "LuauSparkdownElseBlock",
  ],
  LuauIfBlock: ["LuauElseifBlock", "LuauElseBlock"],
  LuauSparkdownChooseBlock: ["LuauSparkdownChooseThenClause"],
};

// Walking back past one of these aborts the choice-body lookup.
// `Choice` ends at the marker line's EOL so a free-standing `Scene`
// or `LuauFunctionDefinition` after some top-level choices isn't
// inside any choice's "body" — it's started a new top-level scope.
const CHOICE_SCOPE_TERMINATORS = new Set<string>([
  "Scene",
  "Branch",
  "LuauFunctionDefinition",
  "LuauDefine",
  "FrontMatter",
]);

// Counts the number of "I'm in a Choice's body" levels active at
// `pos`. The tree models Choice as a single-line node that ends at
// EOL, so the body lines that follow are tree-level *siblings* of
// the marker. We walk each ancestor's prevSibling chain looking for
// a preceding Choice; stops at scope-changing constructs so a
// function declaration written after top-level choices doesn't
// get credited with their indent.
function countChoiceBodies(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
): number {
  let count = 0;
  for (const node of stack) {
    if (!node || !node.node) continue;
    // Skip Choice itself (we're ON a marker line, not in a body)
    // and ChooseThenClause (the `then` keyword line replaces the
    // body of preceding choices — it's at the choose's level, not
    // the choice's body).
    if (node.name === "Choice") continue;
    if (node.name === "LuauSparkdownChooseThenClause") continue;
    // Hitting a scope-changing construct in our ancestor chain means
    // the choice bodies before it don't apply to us — break out.
    if (CHOICE_SCOPE_TERMINATORS.has(node.name)) break;

    let sibling = node.node.prevSibling;
    while (sibling) {
      if (CHOICE_SCOPE_TERMINATORS.has(sibling.name)) break;
      if (sibling.name === "Choice") {
        count += 1;
        break;
      }
      sibling = sibling.prevSibling;
    }
  }
  return count;
}

// Tree-walking indent: returns the count of ancestor blocks whose
// `_content` contains `pos`, minus header/footer adjustments. No
// stack state, no annotation queue — just the tree.
function computeBlockIndent(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
): number {
  let level = 0;
  for (let i = 0; i < stack.length; i++) {
    const node = stack[i];
    if (!node) continue;
    if (!INDENTING_BLOCKS.has(node.name)) continue;

    // `getStack` returns leaf-first: stack[i-1] is the immediate
    // child of stack[i] on the path to the leaf. We're in this
    // block's body iff that immediate child is its `_content`.
    const innerChild = stack[i - 1];
    if (!innerChild) continue;
    if (innerChild.name !== `${node.name}_content`) continue;

    // Sibling-clause override: when the immediate child of this
    // block's `_content` is one of its sibling clauses (`ElseBlock`
    // for `IfBlock`, `ChooseThenClause` for `ChooseBlock`), the
    // clause owns the indent — our `+1` would double-count. We
    // check stack[i-2] (the direct child of stack[i-1]=content) so
    // a clause nested inside a deeper instance of the SAME rule
    // doesn't suppress this outer one.
    const siblings = SIBLING_CLAUSES[node.name];
    if (siblings) {
      const directChild = stack[i - 2];
      if (directChild && siblings.includes(directChild.name)) continue;
    }

    level += 1;
  }
  return level;
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

  // Persistent state across lines — only for things the tree alone
  // can't tell us:
  //   - `Scene` / `Branch` aren't body wrappers; their bodies are
  //     top-level siblings in the tree. We track them as booleans
  //     that flip on scene_begin / branch_begin and back off when
  //     the implicit body ends (next scene, top-level Luau decl, or
  //     a stray `end` keyword closing the scope).
  //   - `Choice` body indent is derived from the tree by walking
  //     prev-siblings (see `countChoiceBodies`). No state needed.
  let sceneActive = false;
  let branchActive = false;

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

  const processIndent = (from: number, to: number) => {
    // Zero-width indent at end-of-doc — skip so we don't emit a
    // ghost trailing-whitespace line.
    if (from === to && from >= document.length) {
      return;
    }
    const range = document.range(from, to);
    const text = document.read(from, to);
    const indentMatch = text.match(INDENT_REGEX);
    const currentIndentation = indentMatch?.[0] || "";
    const indentRange = {
      start: { line: range.start.line, character: range.start.character },
      end: {
        line: range.start.line,
        character: currentIndentation.length,
      },
    };

    let newIndentLevel = tempIndentLevel ?? 0;
    tempIndentLevel = undefined;

    if (tree) {
      // Use the first non-whitespace character on this line as the
      // tree-context anchor. Reading the stack at the leading-WS
      // position would credit the enclosing block's `_content`
      // contribution even for the closing `}` / `)` / `end` keyword,
      // which should align with the OPENING line one level shallower.
      const lineStart = document.offsetAt({
        line: range.start.line,
        character: 0,
      });
      const lineEnd = document.offsetAt({
        line: range.start.line + 1,
        character: 0,
      });
      const lineText = document.read(lineStart, lineEnd);
      const firstNonWs = lineText.search(/\S/);
      const stackPos = firstNonWs >= 0 ? lineStart + firstNonWs : from;
      const stack = getStack<SparkdownNodeName>(tree, stackPos, 1);

      newIndentLevel = computeBlockIndent(stack);

      // Blank lines: leave them entirely empty; don't sprinkle
      // ghost-indent whitespace on otherwise-empty rows.
      if (firstNonWs < 0) {
        const expectedIndentation = "";
        if (currentIndentation !== expectedIndentation) {
          pushIfInRange({
            lineNumber: indentRange.start.line + 1,
            range: indentRange,
            oldText: document.getText(indentRange),
            newText: expectedIndentation,
            type: "indent",
          });
        }
        return;
      }

      // Stray `end` closing scene/branch: sparkdown's `Scene` /
      // `Branch` grammar rules end at the colon, so a top-level
      // `end` keyword written by the user (intending to close the
      // scope) is just a free-standing token in the tree. If the
      // tree shows no enclosing indenting block AND we have an
      // active scene/branch, this `end` pops one scope level.
      const lineLeadText = lineText.slice(firstNonWs);
      const isStrayEnd =
        firstNonWs >= 0 &&
        /^end\b/.test(lineLeadText) &&
        !stack.some(
          (n) =>
            n &&
            (INDENTING_BLOCKS.has(n.name) ||
              n.name.endsWith("_content") ||
              n.name.endsWith("_end")),
        );
      if (isStrayEnd) {
        if (branchActive) {
          branchActive = false;
        } else if (sceneActive) {
          sceneActive = false;
        }
      }

      newIndentLevel += sceneActive ? 1 : 0;
      newIndentLevel += branchActive ? 1 : 0;
      newIndentLevel += countChoiceBodies(stack);

      // FrontMatter is special-cased: field bodies are at level 1,
      // headers at level 0. Anything inside an `Unknown` node (a
      // parse failure region) keeps the source's existing indent.
      const frontMatterNode = stack.find(
        (n) => n && n.name === "FrontMatter",
      );
      if (frontMatterNode) {
        const unknownNode = stack.find((n) => n && n.name === "Unknown");
        const frontMatterFieldContentNode = stack.find(
          (n) => n && n.name === "FrontMatterField_content",
        );
        if (unknownNode) {
          newIndentLevel = currentIndentation.includes("\t")
            ? Math.max(0, currentIndentation.split("\t").length - 1)
            : Math.round(currentIndentation.length / options.tabSize);
        } else {
          newIndentLevel = frontMatterFieldContentNode ? 1 : 0;
        }
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
    // Lookahead — drives sol_comment indent-matching and (just for
    // resets) scene/branch transitions.
    while (aheadCur.value) {
      if (aheadCur.value.type === "sol_comment") {
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
        // New scene declaration — reset prior scene/branch state.
        sceneActive = false;
        branchActive = false;
      } else if (aheadCur.value.type === "branch_begin") {
        // New branch declaration. Branches sit inside a scene body
        // (sceneActive stays as-is). Reset any prior branch state.
        branchActive = false;
      } else if (aheadCur.value.type === "top_level_begin") {
        // Top-level Luau decl (function / define) ends any implicit
        // scene/branch body — they have no explicit terminator in
        // the grammar.
        sceneActive = false;
        branchActive = false;
      }
      break;
    }

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
      // Separator decision is the same whether the span is empty
      // (insert one space?) or already-spaces (collapse to what?):
      // look at the neighboring characters and let
      // `shouldInsertSpaceBetween` decide. If it says no, collapse
      // to empty; if yes, normalize to exactly one space.
      const atLineStart =
        range.start.character === 0 && cur.from === cur.to;
      let expectedText: string;
      if (atLineStart) {
        // Zero-width separator at column 0 — never insert leading
        // whitespace (`indent` handles the row's leading WS).
        expectedText = "";
      } else {
        const nextChar = document.read(cur.to, cur.to + 1);
        const prevChar = document.read(cur.from - 1, cur.from);
        expectedText = shouldInsertSpaceBetween(prevChar, nextChar)
          ? " "
          : "";
      }
      // Skip the no-op zero-width insert (avoid creating a useless
      // empty-text edit).
      if (cur.from === cur.to && expectedText === "") {
        // no-op
      } else {
        const text = document.getText(range);
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
      const text = document.getText(range);
      const marks = text.split(WHITESPACE_REGEX).filter((m) => Boolean(m));
      // Normalize the marker text itself ("*  " → "* ") — the indent
      // for the marker line is already computed from the tree by
      // `processIndent` above.
      const expectedText = marks.join(" ") + " ";
      if (text !== expectedText) {
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
        // Blank line after a divert outdents by 1 (visual paragraph
        // break before the next statement). Stay at 0 if we're
        // already at the outermost level.
        tempIndentLevel = 0;
      }
    } else if (cur.value.type === "scene_begin") {
      // After processing the scene declaration line itself, the
      // implicit body begins. Subsequent lines indent +1 until the
      // scope closes (next scene, top-level Luau decl, stray `end`).
      sceneActive = true;
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
      branchActive = true;
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
      let lastLine = lines.pop();
      while (lastLine && !lastLine.text.trim()) {
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
    indentStack: [] as { type: FormatType; level: number }[],
    indentLevel: 0,
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
        if (curr.type === "separator" && prev.type === "separator") {
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
          result.pop();
        } else if (prev.type === "indent" && curr.type === "separator") {
          continue;
        } else if (curr.type === "indent" && prev.type === "extra") {
          result.pop();
        } else if (prev.type === "indent" && curr.type === "extra") {
          continue;
        } else if (curr.type === "separator" && prev.type === "extra") {
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
          result.pop();
        } else if (prev.type === "separator" && curr.type === "extra") {
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
        } else if (curr.type === "blankline" && prev.type === "indent") {
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
          result.pop();
        } else if (prev.type === "blankline" && curr.type === "separator") {
          continue;
        } else if (curr.newText === "" && prev.newText === "") {
          prev.range.end = curr.range.end;
          continue;
        } else if (prevTo === currFrom) {
          prev.newText += curr.newText;
          prev.range.end = curr.range.end;
          continue;
        } else {
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

  const { edits } = getFormatting(
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
