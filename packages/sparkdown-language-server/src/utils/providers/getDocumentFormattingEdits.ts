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
  // Multi-line function-call arg lists (`foo(\n  arg1,\n  arg2,\n)`)
  // and function-definition parameter lists indent their body one
  // level past the opener — same shape as `LuauParenthetical` and
  // `LuauTable`.
  "LuauFunctionCallParameters",
  "LuauFunctionParameters",
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

// `ElseBlock` whose only content is a single `IfBlock` collapses to
// `elseif`. Both Sparkdown and non-Sparkdown variants. Returns true
// when this node is one of those merge-eligible else blocks so the
// indent logic can treat it as transparent (and the post-format
// rewrite pass deletes the outer `end` and joins keywords).
const MERGEABLE_ELSE_BLOCKS = new Set<SparkdownNodeName>([
  "LuauSparkdownElseBlock",
  "LuauElseBlock",
] as SparkdownNodeName[]);

const MATCHING_IF_BLOCK: Record<string, string> = {
  LuauSparkdownElseBlock: "LuauSparkdownIfBlock",
  LuauElseBlock: "LuauIfBlock",
};

function isElseBlockMergeableIntoIf(
  node: GrammarSyntaxNode<SparkdownNodeName>,
  contentNode: GrammarSyntaxNode<SparkdownNodeName> | undefined,
): boolean {
  if (!MERGEABLE_ELSE_BLOCKS.has(node.name)) return false;
  if (!contentNode) return false;
  const expectedIfName = MATCHING_IF_BLOCK[node.name];
  if (!expectedIfName) return false;
  // Walk content's direct children. Exactly one must be the expected
  // `IfBlock`, and everything else must be insignificant (newlines /
  // whitespace nodes the parser keeps for layout).
  let ifBlockChild: GrammarSyntaxNode<SparkdownNodeName> | undefined;
  let child = contentNode.node.firstChild;
  while (child) {
    const isInsignificant =
      child.name === "Newline" ||
      child.name === "Whitespace" ||
      child.name === "ExtraWhitespace" ||
      child.name === "OptionalWhitespace" ||
      child.name === "RequiredWhitespace" ||
      child.name === "TrailingWhitespace";
    if (!isInsignificant) {
      if (child.name === expectedIfName && !ifBlockChild) {
        ifBlockChild = child.node as GrammarSyntaxNode<SparkdownNodeName>;
      } else {
        // Either a second meaningful child, or a non-If first child —
        // not eligible for elseif collapse.
        return false;
      }
    }
    child = child.nextSibling;
  }
  return !!ifBlockChild;
}

// A line whose first non-whitespace token is a header-opener
// keyword (`then` for an if-block, `do` for a loop's do-block)
// should indent at the HEADER's level, not the body's level. The
// grammar buries these keywords inside `*_content`, so the default
// "in content → +1" rule would put them one level too deep. This
// helper detects the case so `computeBlockIndent` can suppress the
// enclosing block's contribution.
function isHeaderOpenerLine(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  block: GrammarSyntaxNode<SparkdownNodeName>,
): boolean {
  const leaf = stack[0];
  if (!leaf) return false;
  // `then` belongs to an `IfBlock` / `ElseifBlock`.
  if (
    leaf.name === "LuauThenKeyword" &&
    (block.name === "LuauSparkdownIfBlock" ||
      block.name === "LuauIfBlock" ||
      block.name === "LuauSparkdownElseifBlock" ||
      block.name === "LuauElseifBlock")
  ) {
    return true;
  }
  return false;
}

// Continuation-line indent bump: a line whose first non-WS token is
// the operator of a binary `Luau*Operator` rule (arithmetic, compare,
// logical, concat, type-cast, accessor for method chains) sits inside
// an expression that started on a previous line. The structural tree
// has no block boundary at the line-break — `computeBlockIndent` would
// return the parent's depth and leave the continuation line aligned
// with the opening line.
//
// Prettier and Lua's stylua both indent these continuations one level
// past the opener:
//
//   local x = a + b
//     + c + d
//
//   local s = "hello"
//     .. "world"
//
//   obj
//     :method1()
//     :method2()
//
// Detection: the leaf at line-start sits underneath one of the
// `Luau*Operator` rules whose own begin is on THIS line — meaning the
// operator itself opens the line. Lines that merely happen to be
// inside an operator scope (e.g. the RHS operand on the same line as
// the operator) don't trigger; only lines that LEAD with the operator
// token do.
const CONTINUATION_OPERATOR_RULES = new Set<string>([
  "LuauArithmeticOperator",
  "LuauCompareOperator",
  "LuauLogicalOperator",
  "LuauConcatOperator",
  "LuauTypeCastOperator",
  "LuauAccessorOperator",
]);
function isContinuationLine(
  stack: GrammarSyntaxNode<SparkdownNodeName>[],
  lineStart: number,
): boolean {
  for (const node of stack) {
    if (!node) continue;
    if (!CONTINUATION_OPERATOR_RULES.has(node.name)) continue;
    // Operator's own opening must be on the current line — i.e.
    // its node.from >= lineStart. If the operator started on an
    // earlier line, we're inside its scope but not leading with it.
    if (node.from >= lineStart) return true;
  }
  return false;
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

    // `else if … end end` → `elseif … end` transparency. When an
    // `ElseBlock`'s only meaningful content is a single `IfBlock`,
    // the two collapse visually into one `elseif` clause. The
    // `ElseBlock` itself contributes 0 — the inner `IfBlock`'s
    // header/body/end align with the outer `if`'s siblings, exactly
    // as a real `elseif` would. The textual rewrite (see post-format
    // tree walk) deletes the outer `end` and merges `else if` →
    // `elseif`; this rule keeps indent correct so both passes
    // agree.
    if (isElseBlockMergeableIntoIf(node, stack[i - 1])) continue;

    // Header-opener line (e.g. `then` on its own line inside an
    // if-block whose condition was too long to inline). Such lines
    // sit inside `IfBlock_content` but visually belong to the
    // header — indent them at the block's level, not body level.
    if (isHeaderOpenerLine(stack, node)) continue;

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

  // Ensures exactly one blank line precedes `pos`. If the previous
  // line is non-blank (and we're not at the file start), inserts a
  // `\n` at the start of the line containing `pos`. Used to enforce
  // visual separation between top-level constructs (scenes,
  // functions, defines) — prettier-style.
  //
  // Exception: doc comments (`-- …`) directly above a construct stay
  // attached to it without an inserted blank line.
  const ensureBlankLineBefore = (pos: number) => {
    const line = document.positionAt(pos).line;
    if (line <= 0) return;
    const prevLine = document.getLineText(line - 1).trim();
    if (!prevLine) return;
    if (prevLine.startsWith("--")) return;
    const insertPos: Position = { line, character: 0 };
    pushIfInRange({
      lineNumber: line + 1,
      range: { start: insertPos, end: insertPos },
      oldText: "",
      newText: "\n",
      type: "blankline_insert",
    });
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
      // Continuation lines: a line that LEADS with a binary operator
      // (`+`, `..`, `:`, `and`, etc.) belongs to an expression that
      // started on the previous line and should indent one level past
      // the opener (see `isContinuationLine`'s comment).
      if (isContinuationLine(stack, lineStart)) {
        newIndentLevel += 1;
      }

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
      // scope) is just a free-standing token in the tree.
      // Recognize it via the leaf token's grammar type
      // (`LuauEndKeyword`) rather than a source-text regex — the
      // regex would silently misfire on top-level `end` keywords
      // the parser DID match to a block (e.g. an if-block whose
      // recognition we hadn't predicted).
      const leaf = stack[0];
      const isStrayEnd =
        !!leaf &&
        leaf.name === "LuauEndKeyword" &&
        !stack.some(
          (n, i) =>
            i > 0 &&
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
    } else if (cur.value.type === "keyword_separator") {
      // Always exactly one space — bypasses the call-like-opener
      // tightening that would otherwise glue `if`/`for`/`match` to
      // a following `(`.
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
      ensureBlankLineBefore(cur.from);
    } else if (cur.value.type === "top_level_begin") {
      ensureBlankLineBefore(cur.from);
    } else if (cur.value.type === "branch_begin") {
      branchActive = true;
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

  // Inline alternator comma-form → pipe-form. The grammar accepts
  // both `plural(n){one="is",other="are"}` (table-literal sugar)
  // and `plural(n)|one="is"|other="are"` as identical alternator
  // expressions; we normalize to pipe-form. This is a structural
  // rewrite (removes braces, swaps commas for pipes), so we drive
  // it off the parse tree, not source regex.
  if (tree) {
    // Inline alternators (the ones without `Sparkdown` in the name)
    // wrap their pipe-or-table arms via these block names. When the
    // parser saw a `{...}` arm-table instead of `|`, the LuauTable
    // shows up as a descendant — we walk up the ancestor chain to
    // see if it's inside one of these constructs.
    const INLINE_ALTERNATOR_BLOCKS = new Set([
      "LuauConditionalAlternatorBlock",
      "LuauSequentialAlternatorBlock",
    ]);
    tree.iterate({
      enter: (nodeRef) => {
        if (nodeRef.name !== "LuauTable") return;
        // Walk up the ancestor chain looking for an inline-alternator
        // wrapper. If found, this table represents the alternator's
        // arms and gets rewritten to pipe-form.
        let ancestor = nodeRef.node.parent;
        let insideInlineAlternator = false;
        while (ancestor) {
          if (INLINE_ALTERNATOR_BLOCKS.has(ancestor.name)) {
            insideInlineAlternator = true;
            break;
          }
          ancestor = ancestor.parent;
        }
        if (!insideInlineAlternator) return;
        const tableNode = nodeRef.node;
        // Compute the boundary positions: `{` of LuauTable_begin,
        // each top-level `,` (LuauCommaSeparator) inside content,
        // and `}` of LuauTable_end.
        let openBracePos: number | undefined;
        let closeBracePos: number | undefined;
        const commaPositions: { from: number; to: number }[] = [];
        tableNode.cursor().iterate((inner) => {
          if (inner.node === tableNode) return true;
          if (inner.name === "LuauTable_begin") {
            // Find the `{` character at the begin range start.
            if (document.read(inner.from, inner.from + 1) === "{") {
              openBracePos = inner.from;
            }
            return false;
          }
          if (inner.name === "LuauTable_end") {
            if (document.read(inner.from, inner.from + 1) === "}") {
              closeBracePos = inner.from;
            }
            return false;
          }
          if (inner.name === "LuauCommaSeparator") {
            // Top-level comma between arms — find the `,` character.
            let c = inner.from;
            while (c < inner.to && document.read(c, c + 1) !== ",") c += 1;
            if (document.read(c, c + 1) === ",") {
              commaPositions.push({ from: c, to: c + 1 });
            }
            return false;
          }
          // Don't descend into nested tables / function calls — their
          // commas are unrelated to our alternator arms.
          if (inner.name === "LuauTable" || inner.name === "LuauFunctionCall") {
            return false;
          }
          return true;
        });
        if (openBracePos == null || closeBracePos == null) return;
        const pushTreeEdit = (
          from: number,
          to: number,
          newText: string,
          type: string,
        ) => {
          const range: Range = {
            start: document.positionAt(from),
            end: document.positionAt(to),
          };
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText,
            type,
          });
        };
        pushTreeEdit(
          openBracePos,
          openBracePos + 1,
          "|",
          "alternator_open",
        );
        for (const c of commaPositions) {
          pushTreeEdit(c.from, c.to, "|", "alternator_comma");
        }
        pushTreeEdit(
          closeBracePos,
          closeBracePos + 1,
          "",
          "alternator_close",
        );
      },
    });
    // `else if X then BODY end end` → `elseif X then BODY end`. The
    // indent-suppression rule above (`isElseBlockMergeableIntoIf`)
    // already aligns indents as if these were a single `elseif`;
    // here we make the source text match by joining the keywords
    // and dropping the now-redundant outer `end`.
    tree.iterate({
      enter: (nodeRef) => {
        if (!MERGEABLE_ELSE_BLOCKS.has(nodeRef.name as SparkdownNodeName))
          return;
        const elseNode = nodeRef.node;
        // Find begin / content / end children.
        let beginNode, contentNode, endNode;
        let child = elseNode.firstChild;
        while (child) {
          if (child.name.endsWith("_begin")) beginNode = child;
          else if (child.name.endsWith("_content")) contentNode = child;
          else if (child.name.endsWith("_end")) endNode = child;
          child = child.nextSibling;
        }
        // We only need begin + content for `else if` → `elseif`.
        // ElseBlock's own `_end` is zero-width (lookahead on `end`)
        // — the actual `end` keyword that becomes redundant is the
        // INNER if's `end`. After conversion the outer `if`'s `end`
        // continues to close the whole chain.
        if (!beginNode || !contentNode) return;
        void endNode;
        // Verify the eligible pattern (single inner IfBlock).
        const expectedIfName =
          MATCHING_IF_BLOCK[nodeRef.name as string] ?? "";
        let innerIfNode;
        let c = contentNode.firstChild;
        while (c) {
          const insignificant =
            c.name === "Newline" ||
            c.name === "Whitespace" ||
            c.name === "ExtraWhitespace" ||
            c.name === "OptionalWhitespace" ||
            c.name === "RequiredWhitespace" ||
            c.name === "TrailingWhitespace";
          if (!insignificant) {
            if (c.name === expectedIfName && !innerIfNode) {
              innerIfNode = c;
            } else {
              return;
            }
          }
          c = c.nextSibling;
        }
        if (!innerIfNode) return;
        // Locate the inner `if` keyword and inner `end` keyword.
        let elseKeyword, innerIfKeyword, innerEndKeyword;
        beginNode.cursor().iterate((inner) => {
          if (inner.name === "LuauElseKeyword") {
            elseKeyword = { from: inner.from, to: inner.to };
            return false;
          }
          return true;
        });
        // Find the inner if's own _end child (direct child of
        // innerIfNode). We can't just iterate the whole subtree —
        // a nested if-statement inside the body would have its own
        // _end too, and we'd grab the wrong one.
        let innerEndChild;
        let ec = innerIfNode.firstChild;
        while (ec) {
          if (ec.name.endsWith("_end")) {
            innerEndChild = ec;
            break;
          }
          ec = ec.nextSibling;
        }
        if (!innerEndChild) return;
        innerIfNode.cursor().iterate((inner) => {
          if (innerIfKeyword) return false;
          if (inner.name === "LuauIfKeyword") {
            innerIfKeyword = { from: inner.from, to: inner.to };
            return false;
          }
          return true;
        });
        innerEndChild.cursor().iterate((inner) => {
          if (inner.name === "LuauEndKeyword") {
            innerEndKeyword = { from: inner.from, to: inner.to };
            return false;
          }
          return true;
        });
        if (!elseKeyword || !innerIfKeyword || !innerEndKeyword) return;
        // Edit 1: collapse `else…if` into `<indent>elseif`. We
        // extend the range back to the start of the `else` line so
        // the leading whitespace is absorbed too — the elseif chain
        // sits at the OUTER if's level (sibling clauses share their
        // header indent), and absorbing the original WS lets us
        // produce that indent here in one edit (instead of relying
        // on a separate, possibly-conflicting indent edit on the
        // same line).
        //
        // Safety check: only extend back to column 0 if everything
        // before `else` on its line is whitespace. Otherwise we'd
        // clobber preceding content.
        const elseLine = document.positionAt(elseKeyword.from).line;
        const elseLineStart = document.offsetAt({
          line: elseLine,
          character: 0,
        });
        const elsePrelude = document.read(elseLineStart, elseKeyword.from);
        const elsePreludeIsAllWs = /^[ \t]*$/.test(elsePrelude);
        // Indent to emit. The else block is "transparent" per
        // `isElseBlockMergeableIntoIf`, so the elseif keyword sits
        // at the level the else WOULD sit at — which equals the
        // outer if's level. We compute it by looking at the
        // ancestor stack of the `else` keyword's position.
        const elseStack = getStack<SparkdownNodeName>(
          tree,
          elseKeyword.from,
          1,
        );
        const indentLevel = computeBlockIndent(elseStack);
        const indentChars = options.insertSpaces
          ? " ".repeat(indentLevel * options.tabSize)
          : "\t".repeat(indentLevel);
        const joinFrom = elsePreludeIsAllWs
          ? elseLineStart
          : elseKeyword.from;
        const joinPrefix = elsePreludeIsAllWs ? indentChars : "";
        const joinRange: Range = {
          start: document.positionAt(joinFrom),
          end: document.positionAt(innerIfKeyword.to),
        };
        pushIfInRange({
          lineNumber: joinRange.start.line + 1,
          range: joinRange,
          oldText: document.getText(joinRange),
          newText: joinPrefix + "elseif",
          type: "elseif_join",
        });
        // Edit 2: delete the inner `end`'s entire line (leading
        // indent + `end` keyword + trailing newline). The outer if's
        // own `end` continues to close the chain.
        const endLine = document.positionAt(innerEndKeyword.from).line;
        const lineStart: Position = { line: endLine, character: 0 };
        const nextLineStart: Position = { line: endLine + 1, character: 0 };
        const lineRange: Range = { start: lineStart, end: nextLineStart };
        pushIfInRange({
          lineNumber: endLine + 1,
          range: lineRange,
          oldText: document.getText(lineRange),
          newText: "",
          type: "elseif_drop_end",
        });
      },
    });
    // Empty-block compaction. `function f()\n\nend` → `function f() end`,
    // same for `define`. Body-bearing blocks whose body contains
    // nothing meaningful collapse onto one line. Skips blocks that
    // already have a single-line body and ones with comments / any
    // real statement inside.
    const EMPTY_COMPACTABLE_BLOCKS = new Set<string>([
      "LuauFunctionDefinition",
      "LuauDefine",
      "LuauMethodDefinition",
    ]);
    tree.iterate({
      enter: (nodeRef) => {
        if (!EMPTY_COMPACTABLE_BLOCKS.has(nodeRef.name)) return;
        const node = nodeRef.node;
        let contentNode, endNode;
        let child = node.firstChild;
        while (child) {
          if (child.name === `${nodeRef.name}_content`) contentNode = child;
          else if (child.name === `${nodeRef.name}_end`) endNode = child;
          child = child.nextSibling;
        }
        if (!contentNode || !endNode) return;
        // Find the signature: the part of `_content` that represents
        // the declaration (name + params for function/method, name +
        // inheritance for define). Everything after the signature
        // until `_end` is the body. We pick the LAST signature-like
        // child as the boundary.
        const SIGNATURE_NAMES = new Set([
          "LuauFunctionParameters",
          "LuauFunctionReturnTypeAnnotation",
          "LuauFunctionDeclarationName",
          "LuauDefineNameAndInheritance",
          "LuauMethodDeclarationName",
        ]);
        let signatureEnd: number | undefined;
        let bodyHasContent = false;
        let cc = contentNode.firstChild;
        while (cc) {
          if (SIGNATURE_NAMES.has(cc.name)) {
            signatureEnd = cc.to;
          } else {
            const insignificant =
              cc.name === "Newline" ||
              cc.name === "Whitespace" ||
              cc.name === "ExtraWhitespace" ||
              cc.name === "OptionalWhitespace" ||
              cc.name === "RequiredWhitespace" ||
              cc.name === "TrailingWhitespace";
            if (!insignificant && signatureEnd != null) {
              bodyHasContent = true;
              break;
            }
          }
          cc = cc.nextSibling;
        }
        if (bodyHasContent) return;
        if (signatureEnd == null) signatureEnd = contentNode.from;
        const replaceFrom = signatureEnd;
        const replaceTo = endNode.from;
        if (replaceFrom >= replaceTo) return;
        const text = document.read(replaceFrom, replaceTo);
        if (text === " ") return; // already compact
        if (text.trim() !== "") return; // body actually has content
        const range: Range = {
          start: document.positionAt(replaceFrom),
          end: document.positionAt(replaceTo),
        };
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: " ",
          type: "empty_block_compact",
        });
      },
    });
    // Block-opener keyword line-join. Any multi-line Luau header
    // (`if`/`for`/`while`/`repeat` ... `then`/`do`) folds onto a
    // single line. The opener (`then`/`do`) is the anchor; we scan
    // backwards through preceding whitespace+content lines until we
    // hit the loop/conditional header keyword (or, for `then`, the
    // enclosing if-block's `if`), then collapse everything between
    // into single spaces.
    //
    // This handles three cases at once:
    //   `if X\n  then`        → `if X then`
    //   `if\n  X\n  then`     → `if X then`
    //   `while\n  X\n  do`    → `while X do`
    //
    // Pure Luau semantics: newlines are interchangeable with spaces
    // anywhere inside a header. The grammar doesn't quite model
    // this (loop rules terminate at `$`), so the formatter does the
    // visual normalization itself.
    //
    // `then` is overloaded — it also opens the *result* clause of a
    // `choose ... then ... end` construct, where it MUST stay on
    // its own line (separates choices from the result body). Skip
    // join when the keyword sits inside a `LuauSparkdownChooseThenClause`.
    const BLOCK_OPENER_KEYWORDS = new Set(["LuauDoKeyword", "LuauThenKeyword"]);
    const LOOP_CONTENT_NAMES = new Set([
      "LuauSparkdownForLoop_content",
      "LuauSparkdownWhileLoop_content",
      "LuauSparkdownRepeatLoop_content",
      "LuauForLoop_content",
      "LuauWhileLoop_content",
      "LuauRepeatLoop_content",
    ]);
    tree.iterate({
      enter: (nodeRef) => {
        if (!BLOCK_OPENER_KEYWORDS.has(nodeRef.name)) return;
        if (nodeRef.name === "LuauThenKeyword") {
          // `then` is overloaded — `choose ... then ... end` uses
          // it to open the RESULT clause, which must stay on its
          // own line. Skip when the keyword sits inside
          // ChooseThenClause.
          let walker = nodeRef.node.parent;
          let isChooseThen = false;
          while (walker) {
            if (walker.name === "LuauSparkdownChooseThenClause") {
              isChooseThen = true;
              break;
            }
            if (
              walker.name === "LuauSparkdownIfBlock" ||
              walker.name === "LuauIfBlock" ||
              walker.name === "LuauSparkdownElseifBlock" ||
              walker.name === "LuauElseifBlock"
            ) {
              break;
            }
            walker = walker.parent;
          }
          if (isChooseThen) return;
        }
        const kwFrom = nodeRef.from;
        // Find the START of the matching header keyword (`if` /
        // `elseif` / `for` / `while` / `repeat`). We collapse all
        // whitespace/newlines between header-start and this opener.
        //
        // For `then`: tree gives us the enclosing if/elseif block.
        // For `do`: tree often doesn't (the loop's content ends at
        // `$` so the DoBlock is parsed as a sibling). Fall back to
        // a line-by-line scan looking for `for`/`while`/`repeat`.
        let headerStart: number | undefined;
        if (nodeRef.name === "LuauThenKeyword") {
          // Walk up to enclosing IfBlock or ElseifBlock and use
          // its begin's `.to` as the header-start.
          let walker = nodeRef.node.parent;
          while (walker) {
            if (
              walker.name === "LuauSparkdownIfBlock" ||
              walker.name === "LuauIfBlock" ||
              walker.name === "LuauSparkdownElseifBlock" ||
              walker.name === "LuauElseifBlock"
            ) {
              // The begin of this block ends right after `if`/`elseif`.
              let c = walker.firstChild;
              while (c) {
                if (c.name.endsWith("_begin")) {
                  headerStart = c.to;
                  break;
                }
                c = c.nextSibling;
              }
              break;
            }
            walker = walker.parent;
          }
        } else {
          // LuauDoKeyword: walk up to LuauForLoop / LuauWhileLoop /
          // LuauRepeatLoop (nested form) first.
          let walker = nodeRef.node.parent;
          while (walker) {
            if (
              walker.name === "LuauSparkdownForLoop" ||
              walker.name === "LuauForLoop" ||
              walker.name === "LuauSparkdownWhileLoop" ||
              walker.name === "LuauWhileLoop" ||
              walker.name === "LuauSparkdownRepeatLoop" ||
              walker.name === "LuauRepeatLoop"
            ) {
              let c = walker.firstChild;
              while (c) {
                if (c.name.endsWith("_begin")) {
                  headerStart = c.to;
                  break;
                }
                c = c.nextSibling;
              }
              break;
            }
            walker = walker.parent;
          }
          // Sibling fallback: walk back through lines looking for
          // a header keyword (`for`/`while`/`repeat`). Skip blank
          // lines and condition-continuation lines (no `=`, `;`,
          // and not starting with another statement keyword). Bail
          // out on any line that looks like a separate statement
          // — that's our signal the `do` is bare and shouldn't
          // join with the preceding line. Cap the search at 10
          // lines so we don't reach into unrelated code if the
          // user's header is broken.
          if (headerStart == null) {
            const kwLine = document.positionAt(kwFrom).line;
            const STATEMENT_STARTERS = [
              "local ",
              "function ",
              "define ",
              "scene ",
              "branch ",
              "const ",
              "store ",
              "return ",
              "if ",
              "if",
              "end",
              "do",
              "else",
              "elseif ",
              "elseif",
            ];
            for (let line = kwLine - 1; line >= 0 && line > kwLine - 10; line--) {
              const text = document.getLineText(line);
              const trimmed = text.trim();
              if (trimmed === "") continue;
              if (
                trimmed.startsWith("for ") ||
                trimmed.startsWith("while ") ||
                trimmed.startsWith("repeat ") ||
                trimmed === "for" ||
                trimmed === "while" ||
                trimmed === "repeat"
              ) {
                const lineStart = document.offsetAt({
                  line,
                  character: 0,
                });
                const kwIdx = text.search(/\S/);
                const kwMatch = text
                  .slice(kwIdx)
                  .match(/^(for|while|repeat)\b/);
                if (kwMatch) {
                  headerStart = lineStart + kwIdx + kwMatch[0].length;
                }
                break;
              }
              // If line clearly starts a separate statement (local,
              // function, end, etc.), the `do` is bare.
              if (
                STATEMENT_STARTERS.some(
                  (s) => trimmed === s.trim() || trimmed.startsWith(s),
                )
              ) {
                break;
              }
              // Otherwise treat as a condition-continuation line
              // and keep scanning back.
            }
          }
        }
        if (headerStart == null) return;
        if (headerStart >= kwFrom) return;

        // Only join if there's actually a newline in the span (no
        // need to rewrite single-line `if X then`).
        const between = document.read(headerStart, kwFrom);
        if (!between.includes("\n")) return;

        // Collapse every WS-or-newline run to a single space. No
        // trim — the outer slice already accounts for whatever
        // boundary whitespace was actually present in the source,
        // so collapsing in-place preserves single-line idempotency
        // (`if cond then` round-trips identically).
        const newText = between.replace(/\s+/g, " ");

        // Line-length budget. If collapsing the whole header would
        // exceed the budget, keep it multi-line — the opener stays
        // on its own line at header-level indent (see
        // `isHeaderOpenerLine` in `computeBlockIndent` for the
        // indent fix).
        const HEADER_LINE_BUDGET = 100;
        const headerKwLine = document.positionAt(headerStart).line;
        const headerLineStart = document.offsetAt({
          line: headerKwLine,
          character: 0,
        });
        const openerEnd = nodeRef.to;
        const wouldBe = document
          .read(headerLineStart, openerEnd)
          .replace(/\s+/g, " ");
        if (wouldBe.length > HEADER_LINE_BUDGET) return;

        const range: Range = {
          start: document.positionAt(headerStart),
          end: document.positionAt(kwFrom),
        };
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText,
          type: "opener_join",
        });
      },
    });
    // Quote normalization. Convert single-quoted Luau strings
    // (`'foo'`) to double-quoted (`"foo"`) — prettier-style. Skip
    // when the content contains a `"` already (would require
    // re-escaping; keep the user's chosen form). Interpolated
    // template strings (backticks) are NOT touched: they have
    // different semantics (interpolation evaluation). Display-text
    // quotes (`N: "hello"`) live as plain text in dialogue nodes,
    // NOT as `LuauSingleQuotedString` / `LuauDoubleQuotedString`,
    // so they're untouched too.
    tree.iterate({
      enter: (nodeRef) => {
        if (nodeRef.name !== "LuauSingleQuotedString") return;
        const node = nodeRef.node;
        let beginNode, contentNode, endNode;
        let child = node.firstChild;
        while (child) {
          if (child.name.endsWith("_begin")) beginNode = child;
          else if (child.name.endsWith("_content")) contentNode = child;
          else if (child.name.endsWith("_end")) endNode = child;
          child = child.nextSibling;
        }
        if (!beginNode || !contentNode || !endNode) return;
        const contentText = document.read(contentNode.from, contentNode.to);
        // If the content contains a literal `"`, keep single-quoted
        // form — converting would require escape rewrites which
        // risk subtle semantic changes (raw `\` sequences, etc.).
        if (contentText.includes('"')) return;
        // Strip redundant `\'` escapes — single-quote doesn't need
        // escaping inside a double-quoted string.
        const newContent = contentText.split("\\'").join("'");
        const range: Range = {
          start: document.positionAt(node.from),
          end: document.positionAt(node.to),
        };
        pushIfInRange({
          lineNumber: range.start.line + 1,
          range,
          oldText: document.getText(range),
          newText: `"${newContent}"`,
          type: "quote_normalize",
        });
      },
    });
    // Trailing-comma policy for multi-line `LuauTable` literals.
    // Prettier-style: multi-line → add trailing comma after the last
    // field; single-line → strip any trailing comma. Skips empty
    // tables and tables that got rewritten by the alternator pass
    // above (no `{` / `}` left).
    tree.iterate({
      enter: (nodeRef) => {
        if (nodeRef.name !== "LuauTable") return;
        const tableNode = nodeRef.node;
        // Find content range. If begin/end aren't `{` / `}` in the
        // source (e.g. inline alternator that we just rewrote),
        // bail out.
        if (document.read(tableNode.from, tableNode.from + 1) !== "{") return;
        if (document.read(tableNode.to - 1, tableNode.to) !== "}") return;
        const contentFrom = tableNode.from + 1;
        const contentTo = tableNode.to - 1;
        const contentText = document.read(contentFrom, contentTo);
        // Empty table — nothing to do.
        if (!contentText.trim()) return;
        const isMultiline = contentText.includes("\n");
        // Locate the last non-whitespace position inside the content.
        let lastNonWs = contentText.length - 1;
        while (
          lastNonWs >= 0 &&
          (contentText[lastNonWs] === " " ||
            contentText[lastNonWs] === "\t" ||
            contentText[lastNonWs] === "\n" ||
            contentText[lastNonWs] === "\r")
        ) {
          lastNonWs -= 1;
        }
        if (lastNonWs < 0) return;
        const hasTrailingComma = contentText[lastNonWs] === ",";
        const lastNonWsOffset = contentFrom + lastNonWs;
        if (isMultiline && !hasTrailingComma) {
          // Insert `,` immediately after the last field value AND
          // absorb any trailing spaces/tabs through end-of-line so
          // the trailing-whitespace trim pass can't fire on what
          // we just produced (would non-idempotent: pass 1 leaves
          // `0, `, pass 2 trims to `0,`). The range stretches to
          // the next `\n` (or content end) and we emit just `,`.
          const insertFrom = lastNonWsOffset + 1;
          let insertTo = insertFrom;
          while (
            insertTo < contentText.length + contentFrom &&
            (contentText[insertTo - contentFrom] === " " ||
              contentText[insertTo - contentFrom] === "\t")
          ) {
            insertTo += 1;
          }
          const range: Range = {
            start: document.positionAt(insertFrom),
            end: document.positionAt(insertTo),
          };
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: ",",
            type: "trailing_comma_insert",
          });
        } else if (!isMultiline && hasTrailingComma) {
          // Delete the trailing `,` plus the whitespace that was
          // before AND after it inside the table braces — otherwise
          // the surrounding whitespace gets normalized on a second
          // pass (`b = 2 ` vs `b = 2`) and we lose idempotency.
          const commaIdx = lastNonWs;
          let leftBound = commaIdx;
          while (
            leftBound > 0 &&
            (contentText[leftBound - 1] === " " ||
              contentText[leftBound - 1] === "\t")
          ) {
            leftBound -= 1;
          }
          let rightBound = commaIdx + 1;
          while (
            rightBound < contentText.length &&
            (contentText[rightBound] === " " ||
              contentText[rightBound] === "\t")
          ) {
            rightBound += 1;
          }
          const range: Range = {
            start: document.positionAt(contentFrom + leftBound),
            end: document.positionAt(contentFrom + rightBound),
          };
          pushIfInRange({
            lineNumber: range.start.line + 1,
            range,
            oldText: document.getText(range),
            newText: "",
            type: "trailing_comma_delete",
          });
        }
      },
    });
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

// Edit-type precedence. When two overlapping edits can't merge,
// the higher-precedence one wins. Adding a new edit type? Drop one
// entry here and the conflict logic does the rest.
//
// Slots are spaced (10s) to leave room for future types without
// renumbering. Equal precedence is fine — they'll fall to the
// merge/adjacent-concat fallback.
const PRECEDENCE: Record<string, number> = {
  // Targeted character rewrites that nothing else should touch.
  alternator_open: 100,
  alternator_close: 100,
  alternator_comma: 100,
  trailing_comma_insert: 100,
  trailing_comma_delete: 100,
  quote_normalize: 100,
  crlf_normalize: 100,
  empty_block_compact: 100,
  opener_join: 110,
  elseif_join: 110,
  elseif_drop_end: 110,
  choice_mark: 100,
  // Structural line-level edits.
  blankline_insert: 100,
  blankline: 90,
  newline: 90,
  // Whitespace normalization at the leading column.
  indent: 80,
  // Mid-line whitespace.
  keyword_separator: 70,
  separator: 60,
  extra: 50,
  trailing: 40,
};

const precedence = (type: string) => PRECEDENCE[type] ?? 0;

// Pairs that can merge their ranges into one edit (rather than one
// winning and the other being dropped). The winner's `newText` is
// kept; the loser's range is unioned in.
const MERGEABLE: Set<string> = new Set([
  // Same-type unions: two adjacent whitespace dispatches at the same
  // boundary should fuse into one edit, not stay as two adjacent edits.
  "separator|separator",
  "extra|extra",
  // Cross-type mergeables: when both edits target overlapping
  // whitespace and their normalized intents are compatible.
  "keyword_separator|separator",
  "keyword_separator|keyword_separator",
  "separator|extra",
]);

const isMergeable = (a: string, b: string) =>
  MERGEABLE.has(`${a}|${b}`) || MERGEABLE.has(`${b}|${a}`);

export const resolveFormattingConflicts = (
  edits: (TextEdit & { type: string })[] | undefined,
  document: SparkdownDocument,
  formattingOnType?: Position,
): TextEdit[] => {
  const result: (TextEdit & { type: string })[] = [];
  if (!edits) return result;

  const start = (e: TextEdit) => document.offsetAt(e.range.start);
  const end = (e: TextEdit) => document.offsetAt(e.range.end);

  // Union the prev edit's range with curr's, keeping prev's `newText`.
  const unionInto = (
    keep: TextEdit & { type: string },
    other: TextEdit & { type: string },
  ) => {
    if (start(other) < start(keep)) keep.range.start = other.range.start;
    if (end(other) > end(keep)) keep.range.end = other.range.end;
  };

  for (let i = 0; i < edits.length; i++) {
    const curr = structuredClone(edits[i])!;
    const prev = result.at(-1);
    if (!prev || end(prev) < start(curr)) {
      // No overlap — just push. Touching edits (prev.end === curr.start)
      // ARE treated as conflicts here: VS Code's edit applier won't
      // accept adjacent non-overlapping ranges as independent edits,
      // so we collapse them through the same precedence/merge logic
      // below.
      result.push(curr);
      continue;
    }

    // blankline + indent is special: deleting a blank line AND
    // formatting the next line's indent should combine into ONE edit
    // covering both spans, with the indent text appended (so the
    // next line gets its leading whitespace right after the deletion).
    // Skip the concat in trim-and-keep cases where the blank line
    // itself was the body content (no text to indent).
    const blanklineIndentMerge =
      (prev.type === "blankline" && curr.type === "indent") ||
      (prev.type === "indent" && curr.type === "blankline");
    if (blanklineIndentMerge) {
      const blankline = prev.type === "blankline" ? prev : curr;
      const indent = prev.type === "indent" ? prev : curr;
      // Use the indent edit's *content line* as the trim check: if
      // that line has visible characters (or we're formatting-on-type
      // and need to preserve indent at the cursor), concat the
      // indent text after the blankline deletion. Otherwise the
      // blank-line removal stands alone.
      const indentLineHasContent =
        document.getLineText(indent.range.start.line).trim() !== "";
      const shouldConcat = indentLineHasContent || formattingOnType;
      unionInto(prev, curr);
      if (shouldConcat) {
        // The blankline edit deletes; the indent edit inserts WS.
        // After unioning ranges, the deletion + insertion = blankline-deleted-then-indent.
        if (prev.type === "blankline") prev.newText += indent.newText;
        else prev.newText = blankline.newText + prev.newText;
      } else {
        // Just the deletion. prev keeps its newText if it's the
        // blankline; otherwise replace.
        if (prev.type === "indent") prev.newText = blankline.newText;
      }
      // Force prev's type to whichever should dominate for downstream
      // (immaterial after this — the edit is final).
      prev.type = "blankline";
      continue;
    }

    if (isMergeable(prev.type, curr.type)) {
      // Mergeable overlap — keep whichever has higher precedence
      // (its `newText` wins); union ranges.
      if (precedence(curr.type) > precedence(prev.type)) {
        unionInto(curr, prev);
        result.pop();
        result.push(curr);
      } else {
        unionInto(prev, curr);
      }
      continue;
    }

    // Not mergeable — higher precedence wins, lower is dropped.
    // (Ties: drop curr, keep prev — arbitrary but stable.)
    if (precedence(curr.type) > precedence(prev.type)) {
      result.pop();
      result.push(curr);
      continue;
    }
    if (precedence(curr.type) < precedence(prev.type)) {
      continue;
    }

    // Equal precedence, not mergeable, overlapping. Two cases:
    //   - Pure deletions adjacent / overlapping: fuse the range, keep "".
    //   - Touching (prev.end === curr.start) but otherwise unrelated:
    //     fuse text into prev.
    // Anything else is a real conflict the formatter has produced —
    // log and drop curr to keep going.
    if (curr.newText === "" && prev.newText === "") {
      prev.range.end = curr.range.end;
      continue;
    }
    if (end(prev) === start(curr)) {
      prev.newText += curr.newText;
      prev.range.end = curr.range.end;
      continue;
    }
    console.error(
      "ERROR:",
      JSON.stringify({
        line: prev.range.start.line + 1,
        offset: start(prev),
        oldText: document.getText(prev.range),
        newText: prev.newText,
        type: prev.type,
      }),
      " overlaps with ",
      JSON.stringify({
        line: curr.range.start.line + 1,
        offset: start(curr),
        oldText: document.getText(curr.range),
        newText: curr.newText,
        type: curr.type,
      }),
    );
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
