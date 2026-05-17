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
const INLINE_ALTERNATOR_NAMES = new Set([
  "LuauSequentialAlternatorBlock",
  "LuauConditionalAlternatorBlock",
  "LuauSparkdownInlineGluedSequentialAlternatorBlock",
  "LuauSparkdownInlineGluedConditionalAlternatorBlock",
  "LuauSparkdownSingleLineSequentialAlternatorBlock",
  "LuauSparkdownSingleLineConditionalAlternatorBlock",
]);

function isInsideInlineAlternator(node: SparkdownSyntaxNodeRef): boolean {
  for (const ancestor of getContextStack(node.node)) {
    if (INLINE_ALTERNATOR_NAMES.has(ancestor.name)) return true;
  }
  return false;
}

export type FormatType =
  | "separator"
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
  | "block_declaration"
  | "block_declaration_begin"
  | "block_declaration_end";

const INDENT_REGEX: RegExp = /^[ \t]*/;

export class FormattingAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<FormatType>
> {
  processedLineFrom = -1;

  override begin(): void {
    this.processedLineFrom = -1;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<FormatType>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<FormatType>>[] {
    // Universal line-start whitespace handling. Any whitespace-type
    // node that lands at the start of a fresh line gets treated as
    // INDENT, regardless of which grammar rule captured it
    // (`#Indent`, `#Whitespace`, `#ExtraWhitespace`, `#Separator`,
    // `#OptionalSeparator`). This is what gives the formatter
    // idempotency on lines whose leading whitespace the grammar
    // marks under a non-Indent capture (e.g. the indent before `|`
    // in a multi-line alternator, or before `end` in a body block).
    // Without this normalization, pass 1 would collapse the leading
    // whitespace to nothing and pass 2 would re-add it — and round
    // and round.
    if (
      nodeRef.name === "Indent" ||
      nodeRef.name === "Whitespace" ||
      nodeRef.name === "ExtraWhitespace" ||
      nodeRef.name === "OptionalSeparator" ||
      nodeRef.name === "Separator" ||
      nodeRef.name === "TrailingWhitespace"
    ) {
      const currentLine = this.getLineAt(nodeRef.from);
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
      if (nodeRef.name === "Indent") {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("separator").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
    }
    if (
      nodeRef.name === "BlockTitle_begin" ||
      nodeRef.name === "BlockHeading_begin" ||
      nodeRef.name === "BlockTransitional_begin" ||
      nodeRef.name === "BlockWrite_begin" ||
      nodeRef.name === "BlockDialogue_begin" ||
      nodeRef.name === "BlockAction_begin"
    ) {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("block_declaration_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
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
    if (nodeRef.name === "Separator") {
      if (isInsideInlineAlternator(nodeRef)) return annotations;
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("separator").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "OptionalSeparator") {
      if (isInsideInlineAlternator(nodeRef)) return annotations;
      const nextChar = this.read(nodeRef.to, nodeRef.to + 1);
      if (nextChar === "\n" || nextChar === "\r") {
        // An optional separator at end of line is just extra whitespace —
        // collapse it to nothing.
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("extra").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
      } else {
        // Mid-line, an OptionalSeparator becomes a normalized one-space separator.
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("separator").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
      }
      return annotations;
    }
    if (nodeRef.name === "ExtraWhitespace") {
      if (isInsideInlineAlternator(nodeRef)) return annotations;
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("extra").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "TrailingWhitespace") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("trailing").range(
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
    if (
      nodeRef.name === "BlockTitle" ||
      nodeRef.name === "BlockHeading" ||
      nodeRef.name === "BlockTransitional" ||
      nodeRef.name === "BlockWrite" ||
      nodeRef.name === "BlockDialogue" ||
      nodeRef.name === "BlockAction" ||
      // Luau block scopes — emit a block_declaration_end so the
      // formatter's indent stack pops the entries pushed by the
      // corresponding `processBlockDeclaration` calls in
      // `getDocumentFormattingEdits.processIndent`.
      nodeRef.name === "LuauFunctionDefinition" ||
      nodeRef.name === "LuauSparkdownIfBlock" ||
      nodeRef.name === "LuauSparkdownElseifBlock" ||
      nodeRef.name === "LuauSparkdownElseBlock" ||
      nodeRef.name === "LuauSparkdownForLoop" ||
      nodeRef.name === "LuauSparkdownWhileLoop" ||
      nodeRef.name === "LuauSparkdownRepeatLoop" ||
      nodeRef.name === "LuauSparkdownDoBlock" ||
      // Non-Sparkdown Luau variants used inside function bodies.
      nodeRef.name === "LuauIfBlock" ||
      nodeRef.name === "LuauElseifBlock" ||
      nodeRef.name === "LuauElseBlock" ||
      nodeRef.name === "LuauForLoop" ||
      nodeRef.name === "LuauWhileLoop" ||
      nodeRef.name === "LuauRepeatLoop" ||
      nodeRef.name === "LuauDoBlock" ||
      // Sparkdown alternator + choose blocks. Same indent stack model
      // as the Luau control-flow scopes above.
      nodeRef.name === "LuauSparkdownChooseBlock" ||
      nodeRef.name === "LuauSparkdownChooseThenClause" ||
      nodeRef.name === "LuauSparkdownConditionalAlternatorBlock" ||
      nodeRef.name === "LuauSparkdownSequentialAlternatorBlock"
    ) {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("block_declaration_end").range(
          nodeRef.to,
          nodeRef.to,
        ),
      );
      return annotations;
    }
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
