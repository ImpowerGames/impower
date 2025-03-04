import { Range } from "@codemirror/state";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";

export type WhitespaceType =
  | "indent"
  | "separator"
  | "extra"
  | "trailing"
  | "newline";

export class FormattingAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<WhitespaceType>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<WhitespaceType>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<WhitespaceType>>[] {
    if (nodeRef.name === "Whitespace") {
      if (nodeRef.from === this.getLineAt(nodeRef.from).from) {
        // Whitespace is at the start of the line
        annotations.push(
          SparkdownAnnotation.mark<WhitespaceType>("indent").range(
            nodeRef.from,
            nodeRef.to
          )
        );
      }
      return annotations;
    }
    if (nodeRef.name === "Indent") {
      annotations.push(
        SparkdownAnnotation.mark<WhitespaceType>("indent").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "Separator") {
      annotations.push(
        SparkdownAnnotation.mark<WhitespaceType>("separator").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "ExtraWhitespace") {
      annotations.push(
        SparkdownAnnotation.mark<WhitespaceType>("extra").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "TrailingWhitespace") {
      annotations.push(
        SparkdownAnnotation.mark<WhitespaceType>("trailing").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "Newline") {
      annotations.push(
        SparkdownAnnotation.mark<WhitespaceType>("newline").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    return annotations;
  }
}
