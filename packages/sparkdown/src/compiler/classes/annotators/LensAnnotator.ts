import { Range } from "@codemirror/state";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export interface Lens {
  command?: {
    title: string;
    command: string;
    arguments?: unknown[];
  };
  data?: unknown;
}

export class LensAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Lens>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<Lens>>[],
    _nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<Lens>>[] {
    return annotations;
  }
}
