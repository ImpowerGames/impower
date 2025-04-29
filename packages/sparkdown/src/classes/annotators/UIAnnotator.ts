import { Range } from "@codemirror/state";
import { getContextStack } from "@impower/textmate-grammar-tree/src/tree/utils/getContextStack";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export type UIType = "screen" | "component" | "style" | "animation" | "theme";

export class UIAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<UIType>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<UIType>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<UIType>>[] {
    if (nodeRef.name === "ViewDeclarationKeyword") {
      const stack = getContextStack(nodeRef.node);
      const declarationNode = stack.find((n) => n.name === "ViewDeclaration");
      if (declarationNode) {
        const type = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark<UIType>(type as UIType).range(
            declarationNode.from,
            declarationNode.to
          )
        );
      }
      return annotations;
    }
    if (nodeRef.name === "CssDeclarationKeyword") {
      const stack = getContextStack(nodeRef.node);
      const declarationNode = stack.find((n) => n.name === "CssDeclaration");
      if (declarationNode) {
        const type = this.read(nodeRef.from, nodeRef.to);
        annotations.push(
          SparkdownAnnotation.mark<UIType>(type as UIType).range(
            declarationNode.from,
            declarationNode.to
          )
        );
      }
      return annotations;
    }
    return annotations;
  }
}
