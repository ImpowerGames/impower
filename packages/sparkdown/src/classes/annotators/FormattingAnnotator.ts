import { Range } from "@codemirror/state";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { SyntaxNodeRef } from "@lezer/common";
import { SparkdownNodeName } from "../../types/SparkdownNodeName";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export type FormatType =
  | "separator"
  | "extra"
  | "trailing"
  | "newline"
  | "indent"
  | "open_brace"
  | "close_brace"
  | "frontmatter_begin"
  | "frontmatter_end"
  | "define_begin"
  | "define_end"
  | "knot_begin"
  | "knot_end"
  | "case_mark"
  | "alternative_mark"
  | "choice_mark"
  | "gather_mark"
  | "indenting_colon"
  | "sol_comment"
  | "eol_divert"
  | "root";

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
    nodeRef: SparkdownSyntaxNodeRef
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
              currentLine.from + currentIndentation.length
            )
          );
        }
      }
    }
    if (nodeRef.name === "DefineDeclaration_begin") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("define_begin").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "FrontMatter_begin") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("frontmatter_begin").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (
      nodeRef.name === "Knot" ||
      nodeRef.name === "Stitch" ||
      nodeRef.name === "FunctionDeclaration"
    ) {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("root").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "ConditionalBlockOpenBrace") {
      const stack = getContextStack<SparkdownNodeName>(nodeRef.node);
      const parentConditionalBlockNode = stack.find(
        (n) => n.name === "ConditionalBlock"
      );
      if (parentConditionalBlockNode) {
        const multilineNode = getDescendent(
          ["MultilineBlock", "MultilineAlternative"],
          parentConditionalBlockNode
        );
        if (multilineNode) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("open_brace").range(
              nodeRef.from,
              nodeRef.to
            )
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "ConditionalBlockCloseBrace") {
      const stack = getContextStack<SparkdownNodeName>(nodeRef.node);
      const parentConditionalBlockNode = stack.find(
        (n) => n.name === "ConditionalBlock"
      );
      if (parentConditionalBlockNode) {
        const multilineNode = getDescendent(
          ["MultilineBlock", "MultilineAlternative"],
          parentConditionalBlockNode
        );
        if (multilineNode) {
          annotations.push(
            SparkdownAnnotation.mark<FormatType>("close_brace").range(
              nodeRef.from,
              nodeRef.to
            )
          );
          return annotations;
        }
      }
    }
    if (nodeRef.name === "MultilineCaseMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("case_mark").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "MultilineAlternativeMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("alternative_mark").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "ChoiceMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("choice_mark").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "GatherMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("gather_mark").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "IndentingColon") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("indenting_colon").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "KnotBeginMark") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("knot_begin").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "Knot_end") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("knot_end").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "LineComment" || nodeRef.name === "BlockComment") {
      if (nodeRef.from === this.getLineAt(nodeRef.from).from) {
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("sol_comment").range(
            nodeRef.from,
            nodeRef.to
          )
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
            nodeRef.to
          )
        );
      }
      return annotations;
    }
    if (nodeRef.name === "Separator") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("separator").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "ExtraWhitespace") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("extra").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "TrailingWhitespace") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("trailing").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "Newline") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("newline").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      const nextLine = this.getLineAt(nodeRef.to);
      const indentMatch = nextLine.text.match(INDENT_REGEX);
      if (this.processedLineFrom < nextLine.from) {
        this.processedLineFrom = nextLine.from;
        let currentIndentation = indentMatch?.[0] || "";
        annotations.push(
          SparkdownAnnotation.mark<FormatType>("indent").range(
            nodeRef.to,
            nodeRef.to + currentIndentation.length
          )
        );
      }
      return annotations;
    }
    return annotations;
  }

  override leave(
    annotations: Range<SparkdownAnnotation<FormatType>>[],
    nodeRef: SyntaxNodeRef
  ): Range<SparkdownAnnotation<FormatType>>[] {
    if (nodeRef.name === "DefineDeclaration_end") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("define_end").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "FrontMatter_end") {
      annotations.push(
        SparkdownAnnotation.mark<FormatType>("frontmatter_end").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    return annotations;
  }
}
