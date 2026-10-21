import { Range } from "@codemirror/state";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export class LinkAnnotator extends SparkdownAnnotator<SparkdownAnnotation> {
  override enter(
    annotations: Range<SparkdownAnnotation>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation>[] {
    // A `run` statement's operand links to the `.luau` file it names
    // (#1389): the operand without the whitespace after a quoted one.
    if (nodeRef.name === "RunContent") {
      const text = this.read(nodeRef.from, nodeRef.to);
      // value-level: the operand's own text, measuring its trailing whitespace
      const to = nodeRef.from + text.trimEnd().length;
      if (to > nodeRef.from) {
        annotations.push(SparkdownAnnotation.mark().range(nodeRef.from, to));
      }
      return annotations;
    }
    return annotations;
  }
}
