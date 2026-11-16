import { Range } from "@codemirror/state";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { readSourceDirective } from "../../utils/readDirective";

export class ImplicitAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<string>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<string>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<string>>[] {
    if (nodeRef.name === "ImageCommand") {
      const directive = readSourceDirective(nodeRef, (from, to) => this.read(from, to));
      for (const name of directive?.names ?? []) {
        if (/[:~]/.test(name.text)) {
          annotations.push(SparkdownAnnotation.mark("filtered_image").range(name.from, name.to));
        }
      }
    }
    return annotations;
  }
}
