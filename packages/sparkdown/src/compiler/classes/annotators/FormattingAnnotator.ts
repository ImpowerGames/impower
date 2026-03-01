import { Range } from "@codemirror/state";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { SyntaxNodeRef } from "@lezer/common";
import { SparkdownNodeName } from "../../types/SparkdownNodeName";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export type FormatType =
  | "keyword"
  | "separator"
  | "extra"
  | "trailing"
  | "newline"
  | "indent"
  | "open_brace"
  | "close_brace"
  | "frontmatter_begin"
  | "frontmatter_end"
  | "scene_begin"
  | "scene_end"
  | "branch_begin"
  | "branch_end"
  | "function_begin"
  | "function_end"
  | "knot_begin"
  | "knot_end"
  | "stitch_begin"
  | "stitch_end"
  | "case_mark"
  | "alternative_mark"
  | "choice_mark"
  | "gather_mark"
  | "divert_mark"
  | "tunnel_mark"
  | "thread_mark"
  | "optional_mark"
  | "indenting_colon"
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
    if (nodeRef.name === "Indent" || nodeRef.name === "Whitespace") {
      const currentLine = this.getLineAt(nodeRef.from);
      if (currentLine.from === nodeRef.from) {
        if (this.processedLineFrom < currentLine.from) {
          this.processedLineFrom = currentLine.from;
          const indentMatch = currentLine.text.match(INDENT_REGEX);
          let currentIndentation = indentMatch?.[0] || "";
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("indent").range(
              currentLine.from,
              currentLine.from + currentIndentation.length,
            ),
          );
        }
      } else if (nodeRef.name === "Indent") {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("separator").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
      }
    }
    if (nodeRef.name === "ConstKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "VarKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "ListKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "DefineKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "ExternalKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "IncludeKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "TempKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "SequenceKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "ElseKeyword") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("keyword").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (
      nodeRef.name === "DefineViewDeclaration_begin" ||
      nodeRef.name === "DefineStylingDeclaration_begin" ||
      nodeRef.name === "DefinePlainDeclaration_begin" ||
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
    if (nodeRef.name === "FunctionKeyword") {
      if (getContextStack(nodeRef.node).find((n) => n.name === "Function")) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("function_begin").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "Function_end") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("function_end").range(
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
    if (nodeRef.name === "KnotBeginMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("knot_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "Knot_end") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("knot_end").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "StitchBeginMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("stitch_begin").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "Stitch_end") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("stitch_end").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "ConditionalBlockOpenBrace") {
      const stack = getContextStack<SparkdownNodeName>(nodeRef.node);
      const parentConditionalBlockNode = stack.find(
        (n) => n.name === "ConditionalBracedBlock",
      );
      if (parentConditionalBlockNode) {
        const multilineNode = getDescendent(
          ["MultilineBlock", "MultilineAlternative"],
          parentConditionalBlockNode,
        );
        if (multilineNode) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("open_brace").range(
              nodeRef.from,
              nodeRef.to,
            ),
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "ConditionalBlockCloseBrace") {
      const stack = getContextStack<SparkdownNodeName>(nodeRef.node);
      const parentConditionalBlockNode = stack.find(
        (n) => n.name === "ConditionalBracedBlock",
      );
      if (parentConditionalBlockNode) {
        const multilineNode = getDescendent(
          ["MultilineBlock", "MultilineAlternative"],
          parentConditionalBlockNode,
        );
        if (multilineNode) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("close_brace").range(
              nodeRef.from,
              nodeRef.to,
            ),
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "MultilineCaseMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("case_mark").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "MultilineAlternativeMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("alternative_mark").range(
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
    if (nodeRef.name === "GatherMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("gather_mark").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "DivertMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("divert_mark").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "TunnelMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("tunnel_mark").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "ThreadMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("thread_mark").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "OptionalLogicMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("optional_mark").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (
      nodeRef.name === "LineComment" ||
      nodeRef.name === "BlockComment" ||
      nodeRef.name === "Tag"
    ) {
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
      const tunnelArrowNode = getDescendent("TunnelArrow", nodeRef.node);
      if (!tunnelArrowNode) {
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
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("separator").range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    if (nodeRef.name === "OptionalSeparator") {
      const nextChar = this.read(nodeRef.to, nodeRef.to + 1);
      if (nextChar === "\n" || nextChar === "\r") {
        // An optional separator that is followed by the end of the line,
        // should be considered extra space and should be trimmed away
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("extra").range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
      } else {
        const stack = getContextStack<SparkdownNodeName>(nodeRef.node);
        if (
          !stack.some((n) => n.name === "ConditionalBracedBlock_end") ||
          stack.some((n) => n.name === "Choice_begin")
        ) {
          // Optional separators should be enforced to have at least one space,
          // unless they are after a conditional block that is not part of a choice condition.
          // (This is because whitespace or lack thereof is often significant after conditional blocks in text content)
          // (e.g. We should not add a separator space between the block and the period in this {sentence}.)
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("separator").range(
              nodeRef.from,
              nodeRef.to,
            ),
          );
        }
      }
      return annotations;
    }
    if (nodeRef.name === "ExtraWhitespace") {
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
      nodeRef.name === "DefineViewDeclaration" ||
      nodeRef.name === "DefineStylingDeclaration" ||
      nodeRef.name === "DefinePlainDeclaration" ||
      nodeRef.name === "BlockTitle" ||
      nodeRef.name === "BlockHeading" ||
      nodeRef.name === "BlockTransitional" ||
      nodeRef.name === "BlockWrite" ||
      nodeRef.name === "BlockDialogue" ||
      nodeRef.name === "BlockAction"
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
