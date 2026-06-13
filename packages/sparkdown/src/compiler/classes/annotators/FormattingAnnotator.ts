import { Range } from "@codemirror/state";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { SyntaxNodeRef } from "@lezer/common";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

// Inline alternator constructs whose body content lives on a single
// line — either embedded in dialogue/action via interpolation
// (`{queue|a|b}`) or written as the single-line block-form
// (`queue | A | B | C end`). Whitespace inside these participates in
// the runtime's typing-pacing — see docs/compiler/GRAMMAR.md and the project
// memory on dialogue/glue/break significance — so the formatter must
// NOT collapse / normalize it.
//
// The pure-expression alternator rules (`LuauSequentialAlternatorBlock`
// / `LuauConditionalAlternatorBlock`, no `Sparkdown` prefix) are the
// shape that appears inside `{...}` interpolations — that's where the
// pacing concern lives, since the surrounding context is display text.
// Control / alternator keywords whose trailing whitespace MUST be
// at least one space, even when followed by `(`. Prettier-style
// `if (cond)` / `match (player_class)` separation — these aren't
// function calls, the parens are arg grouping, so the keyword
// shouldn't tighten against them like `foo(x)` does. Only triggers
// for the multi-line / block forms; inline alternators inside `{}`
// interpolations stay collapsed via `isInsideInlineAlternator`.
const KEYWORDS_REQUIRING_TRAILING_SPACE = new Set([
  "LuauIfKeyword",
  "LuauElseifKeyword",
  "LuauForKeyword",
  "LuauWhileKeyword",
  "LuauRepeatKeyword",
  "LuauChooseKeyword",
  "LuauThenKeyword",
  "LuauControlKeyword",
  "LuauReturnKeyword",
  "LuauDoKeyword",
  "LuauWithKeyword",
  "LuauNewKeyword",
  "LuauLocalKeyword",
  "LuauStoreKeyword",
  "LuauConstKeyword",
  "LuauFunctionKeyword",
  "LuauDefineKeyword",
  "LuauAsKeyword",
  "LuauInKeyword",
  "SceneKeyword",
  "BranchKeyword",
]);

// Alternator forms whose ARM CONTENT is *display text* (not a Luau
// expression). These carry typing-pacing significance: whitespace
// between/around the `|` separators is part of the rendered output,
// so the formatter must leave it alone.
const PRESERVE_WHITESPACE_ALTERNATOR_NAMES = new Set([
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
]);

// Any inline alternator form — these all live on a single line and
// should be tight (no `keyword (paren)` separation). Includes both
// the display-text variants above AND the Luau-expression variants
// (`{plural(n)|one="is"|other="are"}`).
const ALL_INLINE_ALTERNATOR_NAMES = new Set([
  ...PRESERVE_WHITESPACE_ALTERNATOR_NAMES,
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorBlock",
]);

function isInsideInlineAlternator(
  node: SparkdownSyntaxNodeRef,
  read: (from: number, to: number) => string,
): boolean {
  return isInsideAlternatorSet(node, read, PRESERVE_WHITESPACE_ALTERNATOR_NAMES);
}

function isInsideAnyInlineAlternator(
  node: SparkdownSyntaxNodeRef,
  read: (from: number, to: number) => string,
): boolean {
  return isInsideAlternatorSet(node, read, ALL_INLINE_ALTERNATOR_NAMES);
}

// Detects whether a whitespace node sits immediately after a
// unary `-` operator. The grammar may model `<lhs> <op> <rhs>` in
// two shapes:
//   1. LHS is a SIBLING of the `LuauArithmeticOperation` (the
//      `1` in `1 + 2` sits next to the operation containing `+ 2`).
//   2. LHS is a sibling of the OPERATOR *inside* the operation
//      (the `-` in `-x + y` sits inside one operation whose
//      content is `- x + y`).
// "Unary" = NEITHER shape produced a value before the operator.
function isAfterUnaryOperator(node: SparkdownSyntaxNodeRef): boolean {
  let walker = node.node.parent;
  let opNode: SparkdownSyntaxNodeRef["node"] | null = null;
  while (walker) {
    if (walker.name === "LuauArithmeticOperator") {
      opNode = walker;
      break;
    }
    walker = walker.parent;
  }
  if (!opNode) return false;
  if (node.from <= opNode.from) return false;
  let operation: SparkdownSyntaxNodeRef["node"] | null = opNode.parent;
  while (operation && operation.name !== "LuauArithmeticOperation") {
    operation = operation.parent;
  }
  if (!operation) return false;

  const isInsignificant = (n: { name: string } | null | undefined) =>
    !!n &&
    (n.name === "Newline" ||
      n.name === "Whitespace" ||
      n.name === "ExtraWhitespace" ||
      n.name === "OptionalWhitespace" ||
      n.name === "RequiredWhitespace" ||
      n.name === "TrailingWhitespace");

  // Shape 2: operator's preceding sibling inside its content.
  // For `-x + y` (one operation with op,value,op,value children),
  // the `+` has `x` (a value) as its prev sibling inside content
  // → binary. The `-` has nothing → unary.
  let sib = opNode.prevSibling;
  while (sib) {
    if (!isInsignificant(sib)) return false; // has LHS → binary
    sib = sib.prevSibling;
  }

  // Shape 1: operation's preceding sibling at its parent level.
  // For `1 + 2` (LHS sits OUTSIDE the operation as a sibling), the
  // operation has `1` as prev sibling → binary.
  sib = operation.prevSibling;
  while (sib) {
    if (!isInsignificant(sib)) return false; // has LHS → binary
    sib = sib.prevSibling;
  }

  return true;
}

// True iff `node` sits inside an inline UI element attribute
// (`#class=root`, `@click=fn`). Used to keep the `=` tight.
function isInsideUIAttribute(node: SparkdownSyntaxNodeRef): boolean {
  for (const ancestor of getContextStack(node.node)) {
    if (ancestor.name === "LuauUIAttribute") {
      return true;
    }
  }
  return false;
}

function isInsideAlternatorSet(
  node: SparkdownSyntaxNodeRef,
  read: (from: number, to: number) => string,
  names: Set<string>,
): boolean {
  for (const ancestor of getContextStack(node.node)) {
    if (!names.has(ancestor.name)) continue;
    // The shared rule names cover BOTH the single-line inline form
    // and the multi-line block form (e.g. `return ( chain | ... end )`).
    // Only the single-line form is "inline" for formatter purposes.
    const span = read(ancestor.from, ancestor.to);
    if (span.includes("\n")) continue;
    return true;
  }
  return false;
}

export type FormatType =
  | "separator"
  // Like `separator` but always normalizes to one space — bypasses
  // `shouldInsertSpaceBetween`'s call-like-opener rule. Used right
  // after control keywords (`if`, `for`, `match`, etc.) so that
  // `match(x)` formats to `match (x)` even though `(` after a word
  // char would normally be tightened (function-call style).
  | "keyword_separator"
  | "extra"
  | "trailing"
  | "newline"
  | "indent"
  | "frontmatter_begin"
  | "frontmatter_end"
  | "scene_begin"
  | "branch_begin"
  | "choice_mark"
  | "sol_comment"
  | "eol_divert"
  | "blankline"
  | "frontmatter"
  // A top-level Luau declaration (function / define) starts here.
  // Sparkdown's scene/branch have no explicit body terminator, so the
  // formatter resets its scene/branch state when it sees this so
  // subsequent top-level constructs format against column 0.
  | "top_level_begin";

const INDENT_REGEX: RegExp = /^[ \t]*/;

export class FormattingAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<FormatType>
> {
  processedLineFrom = -1;

  override begin(): void {
    this.processedLineFrom = -1;
  }

  // True iff `nodeRef` is a direct child of the document root —
  // there's nothing between it and the top of the tree. Used to
  // detect top-level Luau declarations (function / define) so the
  // formatter can reset the scene-body indent stack before they
  // start. Skips through anonymous capture wrappers (`*_c1`,
  // `*_begin`, etc.) that don't represent real nesting.
  private isTopLevel(nodeRef: SparkdownSyntaxNodeRef): boolean {
    const stack = getContextStack(nodeRef.node);
    for (const ancestor of stack) {
      if (ancestor === nodeRef.node) continue;
      const name = ancestor.name;
      if (
        name === "sparkdown" ||
        name === "Program" ||
        name === "Document"
      ) {
        continue;
      }
      // Any real ancestor disqualifies us.
      return false;
    }
    return true;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<FormatType>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<FormatType>>[] {
    // Universal whitespace dispatch keyed on POSITION first, then name.
    // Any whitespace-class node — `Whitespace`, `ExtraWhitespace`,
    // `RequiredWhitespace`, `OptionalWhitespace` — gets the same
    // line-start / line-end / mid-line decision tree here. That's
    // what gives the formatter idempotency: pass 1 emits the right
    // annotation regardless of which rule the grammar author chose,
    // so pass 2 sees the same text and produces the same output.
    // (There's no dedicated `Indent` or `TrailingWhitespace` rule
    // in the grammar — the position checks below replace them.)
    if (
      nodeRef.name === "Whitespace" ||
      nodeRef.name === "ExtraWhitespace" ||
      nodeRef.name === "OptionalWhitespace" ||
      nodeRef.name === "RequiredWhitespace" ||
      nodeRef.name === "TrailingWhitespace"
    ) {
      const currentLine = this.getLineAt(nodeRef.from);
      // Line start → treat as indent regardless of which rule captured it.
      if (currentLine.from === nodeRef.from) {
        if (this.processedLineFrom < currentLine.from) {
          this.processedLineFrom = currentLine.from;
          const indentMatch = currentLine.text.match(INDENT_REGEX);
          const currentIndentation = indentMatch?.[0] || "";
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("indent").range(
              currentLine.from,
              currentLine.from + currentIndentation.length,
            ),
          );
        }
        return annotations;
      }
      // Line end (next char is a newline or end-of-doc) → trailing
      // whitespace, trim if `trimTrailingWhitespace` is on.
      const nextChar = this.read(nodeRef.to, nodeRef.to + 1);
      if (nextChar === "\n" || nextChar === "\r" || nextChar === "") {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("trailing").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "FrontMatter_begin") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("frontmatter_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "SceneKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("scene_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    // (Scene_end annotation removed — scene declarations no longer
    // accept a trailing colon, so there's no end-of-declaration token
    // for the formatter to normalize.)
    // Top-level Luau declarations (function / define) terminate the
    // implicit scene-body that scene_begin pushed onto the indent
    // stack. Emit a `top_level_begin` so the formatter resets indent
    // tracking before starting the declaration's own indent context.
    // "Top-level" = direct child of the document root: any deeper
    // nesting means we're inside another construct (e.g. a nested
    // function inside a function body) and the parent's indent
    // context should stay.
    if (
      nodeRef.name === "LuauFunctionDefinition" ||
      nodeRef.name === "LuauDefine" ||
      nodeRef.name === "LuauStyle" ||
      nodeRef.name === "LuauScreen" ||
      nodeRef.name === "LuauComponent"
    ) {
      if (this.isTopLevel(nodeRef)) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("top_level_begin").range(
            nodeRef.from,
            nodeRef.from,
          ),
        );
      }
    }
    if (nodeRef.name === "BranchKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("branch_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    // (Branch_end annotation removed — see Scene_end note above.)
    // Wordlike binary operators (`and`, `or`, `not`) — the
    // operator's trailing-WS capture sits between the keyword and
    // its right operand. When the operand begins with `(`, the
    // default separator would tighten (`and(y or z)` instead of
    // `and (y or z)`). Emit `keyword_separator` right after the
    // keyword text to force the space.
    if (nodeRef.name === "LuauLogicalOperator") {
      // Skip leading WS captured inside the operator's range to find
      // the keyword's start.
      let kwStart = nodeRef.from;
      while (
        kwStart < nodeRef.to &&
        (this.read(kwStart, kwStart + 1) === " " ||
          this.read(kwStart, kwStart + 1) === "\t")
      ) {
        kwStart += 1;
      }
      for (const kw of ["and", "or", "not"]) {
        const slice = this.read(kwStart, kwStart + kw.length);
        if (slice !== kw) continue;
        const kwEnd = kwStart + kw.length;
        // Only emit when the operand starts with `(` — other operand
        // shapes are handled fine by the default separator dispatch.
        let scan = kwEnd;
        while (
          this.read(scan, scan + 1) === " " ||
          this.read(scan, scan + 1) === "\t"
        ) {
          scan += 1;
        }
        if (this.read(scan, scan + 1) === "(") {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
              kwEnd,
              kwEnd,
            ),
          );
        }
        break;
      }
    }
    // Binary operators whose character spelling would trip the
    // default `separator` dispatch (because of `NO_SPACE_AFTER`/
    // `NO_SPACE_BEFORE` rules for `.`). Emit `keyword_separator`
    // at the actual operator-token boundaries so the formatter
    // forces single spaces regardless of the `.` rule.
    // `..` (concat) is the main one — `"a".."b"` should be
    // `"a" .. "b"`.
    if (nodeRef.name === "LuauConcatOperator") {
      // Find the `..` position by scanning past any leading WS the
      // operator scope captured into its begin pattern.
      let opStart = nodeRef.from;
      while (
        opStart < nodeRef.to &&
        (this.read(opStart, opStart + 1) === " " ||
          this.read(opStart, opStart + 1) === "\t")
      ) {
        opStart += 1;
      }
      if (this.read(opStart, opStart + 2) === "..") {
        const opEnd = opStart + 2;
        // Suppress emissions adjacent to line breaks — line-leading
        // and line-trailing whitespace is handled by `indent` /
        // `trailing` dispatch, not by separator insertion.
        //
        // "Adjacent to a line break" includes the multi-line case
        //   "hello"
        //     .. "world"
        // where the chars between the `..` and the previous newline
        // are all horizontal whitespace (the indent). Scan past
        // intervening spaces/tabs before deciding so the leading
        // continuation-line `..` doesn't get a spurious `before`
        // separator on top of the indent.
        const isLineBreak = (c: string) => c === "\n" || c === "\r" || c === "";
        let beforeScan = opStart - 1;
        while (beforeScan >= 0) {
          const c = this.read(beforeScan, beforeScan + 1);
          if (c === " " || c === "\t") {
            beforeScan -= 1;
            continue;
          }
          break;
        }
        const before =
          beforeScan < 0 ? "" : this.read(beforeScan, beforeScan + 1);
        let afterScan = opEnd;
        while (true) {
          const c = this.read(afterScan, afterScan + 1);
          if (c === " " || c === "\t") {
            afterScan += 1;
            continue;
          }
          break;
        }
        const after = this.read(afterScan, afterScan + 1);
        if (!isLineBreak(before)) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
              opStart,
              opStart,
            ),
          );
        }
        if (!isLineBreak(after)) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
              opEnd,
              opEnd,
            ),
          );
        }
      }
    }
    // Keyword-trailing-space marker: only fires when the keyword is
    // followed by `(` — that's the case where the default
    // `separator` dispatch would tighten (function-call style) and
    // produce `if(cond)` / `match(x)`. For other followers the
    // existing mid-line separator dispatch handles spacing fine.
    // Inline alternators inside `{...}` interpolations skip this
    // so the collapsed form stays intact.
    if (KEYWORDS_REQUIRING_TRAILING_SPACE.has(nodeRef.name)) {
      let scanPos = nodeRef.to;
      while (true) {
        const ch = this.read(scanPos, scanPos + 1);
        if (ch === " " || ch === "\t") {
          scanPos += 1;
          continue;
        }
        break;
      }
      const nextChar = this.read(scanPos, scanPos + 1);
      if (nextChar === "(") {
        // Any inline alternator (display-text variants AND
        // Luau-expression variants like `{plural(n)|one=...}`)
        // should stay tight — never `plural (n)`.
        const insideInline =
          nodeRef.name === "LuauControlKeyword" &&
          isInsideAnyInlineAlternator(nodeRef, (from, to) =>
            this.read(from, to),
          );
        if (!insideInline) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("keyword_separator").range(
              nodeRef.to,
              nodeRef.to,
            ),
          );
        }
      }
    }
    if (nodeRef.name === "ChoiceMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("choice_mark").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "Tag") {
      if (nodeRef.from === this.getLineAt(nodeRef.from).from) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("sol_comment").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "Divert") {
      const tunnelMarkNode = getDescendent("TunnelMark", nodeRef.node);
      if (!tunnelMarkNode) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("eol_divert").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
      }
      return annotations;
    }
    // Mid-line dispatch for the whitespace classes the universal
    // line-start / line-end check above didn't claim:
    //   - RequiredWhitespace / OptionalWhitespace → "separator"
    //     (normalize to one space, insert one if zero-width via
    //     the formatter's shouldInsertSpaceBetween rules).
    //   - ExtraWhitespace → "extra" (collapse to nothing).
    //   - Whitespace → preserve, no annotation.
    //
    // Inline alternators get special treatment:
    //   - Display-text variants (`PRESERVE_WHITESPACE_ALTERNATOR_NAMES`):
    //     whitespace is part of the rendered output (typing-pacing) →
    //     skip emission entirely.
    //   - Luau-expression variants (`{plural(n)|key="val"|...}`):
    //     should be TIGHT — emit `extra` so structural whitespace
    //     around `=` / `|` collapses (string-literal contents stay
    //     intact because the parser treats them as one token).
    if (
      nodeRef.name === "RequiredWhitespace" ||
      nodeRef.name === "OptionalWhitespace"
    ) {
      const read = (from: number, to: number) => this.read(from, to);
      if (isInsideInlineAlternator(nodeRef, read)) return annotations;
      const tightInline = isInsideAnyInlineAlternator(nodeRef, read);
      // Unary `-` collapse: if this WS sits immediately after a unary
      // ArithmeticOperator (`-x` not `a - b`), force tight (no space).
      // Grammar doesn't distinguish unary from binary, so we detect
      // by walking up: if the WS's ancestor is the trailing capture
      // of a LuauArithmeticOperator whose enclosing
      // ArithmeticOperation starts with that operator (no LHS),
      // it's unary.
      const tightUnary = isAfterUnaryOperator(nodeRef);
      // Inline UI attribute `=` stays TIGHT (`#class=root`, HTML/JSX
      // style), unlike `style`-block props / Luau assignments. ONLY the
      // whitespace adjacent to the `=` — the leading space before `#`
      // separates attributes and must stay one space.
      const tightUIAttr =
        isInsideUIAttribute(nodeRef) &&
        (this.read(nodeRef.to, nodeRef.to + 1) === "=" ||
          this.read(nodeRef.from - 1, nodeRef.from) === "=");
      annotations.push(
        SparkdownAnnotation.mark<FormatType>(
          tightInline || tightUnary || tightUIAttr ? "extra" : "separator",
        ).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (nodeRef.name === "ExtraWhitespace") {
      if (isInsideInlineAlternator(nodeRef, (from, to) => this.read(from, to)))
        return annotations;
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("extra").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "Newline") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("newline").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      const nextLine = this.getLineAt(nodeRef.to);
      const indentMatch = nextLine.text.match(INDENT_REGEX);
      if (this.processedLineFrom < nextLine.from) {
        this.processedLineFrom = nextLine.from;
        let currentIndentation = indentMatch?.[0] || "";
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("indent").range(
            nodeRef.to,
            nodeRef.to + currentIndentation.length,
          ),
        );
      }
      return annotations;
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<FormatType>>[],
    nodeRef: SyntaxNodeRef,
  ): Range<SparkdownAnnotation<FormatType>>[] {
    if (nodeRef.name === "FrontMatter") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("frontmatter_end").range(
          nodeRef.to,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    return annotations;
  }
}
