import { Range } from "@codemirror/state";
import { SyntaxNodeRef } from "@lezer/common";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export class TransitionAnnotator extends SparkdownAnnotator {
  override enter(
    annotations: Range<SparkdownAnnotation>[],
    nodeRef: SyntaxNodeRef
  ): Range<SparkdownAnnotation>[] {
    if (nodeRef.name === "Transition_content") {
      annotations.push(
        SparkdownAnnotation.mark().range(nodeRef.from, nodeRef.to)
      );
    }
    return annotations;
  }
}
