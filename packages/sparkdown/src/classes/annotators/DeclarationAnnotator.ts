import { Range } from "@codemirror/state";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";

export type DeclarationType =
  | "function"
  | "knot"
  | "stitch"
  | "label"
  | "const"
  | "var"
  | "temp"
  | "list"
  | "define"
  | "param";

export class DeclarationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<DeclarationType>
> {
  override enter(
    annotations: Range<SparkdownAnnotation<DeclarationType>>[],
    nodeRef: SparkdownSyntaxNodeRef
  ): Range<SparkdownAnnotation<DeclarationType>>[] {
    if (nodeRef.name === "FunctionDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<DeclarationType>("function").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "KnotDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<DeclarationType>("knot").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "StitchDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<DeclarationType>("stitch").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "LabelDeclarationName") {
      annotations.push(
        SparkdownAnnotation.mark<DeclarationType>("label").range(
          nodeRef.from,
          nodeRef.to
        )
      );
      return annotations;
    }
    if (nodeRef.name === "VariableDeclarationName") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("ConstDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<DeclarationType>("const").range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
      if (context.includes("VarDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<DeclarationType>("var").range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
      if (context.includes("TempDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<DeclarationType>("temp").range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    if (nodeRef.name === "ListTypeDeclarationName") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("ListDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<DeclarationType>("list").range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    if (nodeRef.name === "DefineIdentifier") {
      const context = getContextNames(nodeRef.node);
      if (context.includes("DefineDeclaration")) {
        annotations.push(
          SparkdownAnnotation.mark<DeclarationType>("define").range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    if (nodeRef.name === "Parameter") {
      const context = getContextNames(nodeRef.node);
      if (
        !context.includes("FunctionCall") &&
        context.includes("FunctionParameters")
      ) {
        annotations.push(
          SparkdownAnnotation.mark<DeclarationType>("param").range(
            nodeRef.from,
            nodeRef.to
          )
        );
        return annotations;
      }
    }
    return annotations;
  }
}
