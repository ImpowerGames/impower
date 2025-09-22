import { Range } from "@codemirror/state";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export class HeadingAnnotator extends SparkdownAnnotator {
  override enter(
    annotations: Range<SparkdownAnnotation>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation>[] {
    if (nodeRef.name === "Heading_content") {
      annotations.push(
        SparkdownAnnotation.mark().range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    return annotations;
  }
}
