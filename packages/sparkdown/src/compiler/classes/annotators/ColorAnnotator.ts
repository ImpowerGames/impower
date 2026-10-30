import { Range } from "@codemirror/state";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface ColorInfo {
  possibleColorReference?: boolean;
}

export class ColorAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<ColorInfo>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<ColorInfo>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<ColorInfo>>[] {
    if (nodeRef.name === "Color") {
      annotations.push(
        SparkdownAnnotation.mark({}).range(nodeRef.from, nodeRef.to),
      );
      return annotations;
    }
    if (
      nodeRef.name === "StylingStringIdentifier" ||
      nodeRef.name === "ParameterStringIdentifier"
    ) {
      annotations.push(
        SparkdownAnnotation.mark({ possibleColorReference: true }).range(
          nodeRef.from,
          nodeRef.to,
        ),
      );
      return annotations;
    }
    return annotations;
  }
}
