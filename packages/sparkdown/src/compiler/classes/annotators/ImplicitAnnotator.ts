import { Range } from "@codemirror/state";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { distinctRanges } from "../../utils/distinctRanges";
import { readSourceDirectiveTexts } from "../../utils/readDirective";

export class ImplicitAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<string>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<string>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<string>>[] {
    if (nodeRef.name === "ImageCommand") {
      const { directives } = readSourceDirectiveTexts(nodeRef, (from, to) => this.read(from, to));
      const names = directives.flatMap((directive) => directive.names).filter((name) => /[:~]/.test(name.text));
      annotations.push(...distinctRanges(names.map((name) => SparkdownAnnotation.mark("filtered_image").range(name.from, name.to))));
    }
    return annotations;
  }
}
