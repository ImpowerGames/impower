import { Range } from "@codemirror/state";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";

export class ImplicitAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<string>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<string>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<string>>[] {
    if (nodeRef.name === "AssetCommandName") {
      const context = getContextNames(nodeRef.node);
      // Define implicit filtered_image
      if (context.includes("ImageCommand")) {
        const text = this.read(nodeRef.from, nodeRef.to);
        if (text.includes("~")) {
          annotations.push(
            SparkdownAnnotation.mark("filtered_image").range(
              nodeRef.from,
              nodeRef.to
            )
          );
          return annotations;
        }
      }
    }
    return annotations;
  }
}
