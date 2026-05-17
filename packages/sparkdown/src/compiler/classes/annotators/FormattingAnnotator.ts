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
// the runtime's typing-pacing — see GRAMMAR.md §12 and the project
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

const INLINE_ALTERNATOR_NAMES = new Set([
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorBlock",
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
]);

function isInsideInlineAlternator(
  node: SparkdownSyntaxNodeRef,
  read: (from: number, to: number) => string,
): boolean {
  for (const ancestor of getContextStack(node.node)) {
    if (!INLINE_ALTERNATOR_NAMES.has(ancestor.name)) continue;
    // Same-rule grammar names cover BOTH the single-line inline form
    // (`{queue|a|b}` or `queue | a | b end`) and the multi-line
    // block form written inside a Luau expression like
    // `return ( chain | ... end )`. Only the single-line form
    // carries runtime typing-pacing significance — multi-line
    // blocks should be normalized like any other body content. We
    // distinguish by checking whether the ancestor spans a newline.
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
  | "scene_end"
  | "branch_begin"
  | "branch_end"
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
    if (nodeRef.name === "Scene_end") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("scene_end").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
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
      nodeRef.name === "LuauDefine"
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
    if (nodeRef.name === "Branch_end") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("branch_end").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
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
        const before = this.read(opStart - 1, opStart);
        const after = this.read(opEnd, opEnd + 1);
        const isLineBreak = (c: string) => c === "\n" || c === "\r" || c === "";
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
        const insideInline =
          nodeRef.name === "LuauControlKeyword" &&
          isInsideInlineAlternator(nodeRef, (from, to) => this.read(from, to));
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
    if (
      nodeRef.name === "RequiredWhitespace" ||
      nodeRef.name === "OptionalWhitespace"
    ) {
      if (isInsideInlineAlternator(nodeRef, (from, to) => this.read(from, to)))
        return annotations;
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("separator").range(
          nodeRef.from,
          nodeRef.to,
        ),
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
