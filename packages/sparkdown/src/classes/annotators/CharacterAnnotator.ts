import { Range } from "@codemirror/state";
import { SyntaxNodeRef } from "@lezer/common";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import { SparkdownNodeName } from "../../types/SparkdownNodeName";

export class CharacterAnnotator extends SparkdownAnnotator {
  override enter(
    annotations: Range<SparkdownAnnotation>[],
    nodeRef: SyntaxNodeRef & { name: SparkdownNodeName }
  ): Range<SparkdownAnnotation>[] {
    if (nodeRef.name === "DialogueCharacter") {
      annotations.push(
        SparkdownAnnotation.mark().range(nodeRef.from, nodeRef.to)
      );
      return annotations;
    }
    return annotations;
  }
}
