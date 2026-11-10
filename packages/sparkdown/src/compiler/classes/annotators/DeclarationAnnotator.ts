import { ancestorMatching } from "../../utils/ancestorMatching";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  VARIABLE_DEFINITION_NAMES,
  isBareDeclarationTarget,
  isValueListName,
} from "../../utils/variableDefinitionNames";
import { Range } from "@codemirror/state";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";

export type DeclarationType =
  | "function"
  | "scene"
  | "branch"
  | "label"
  | "const"
  | "var"
  | "define"
  | "param"
  | "end";

const VARIABLE_DECL_SITE = nodeNameSet(["LuauVariableAssignment_begin"]);
const FUNCTION_DECL_NAME = nodeNameSet(["LuauFunctionDeclarationName"]);

export class DeclarationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<DeclarationType>
> {
  private push(
    annotations: Range<SparkdownAnnotation<DeclarationType>>[],
    type: DeclarationType,
    from: number,
    to: number,
  ): Range<SparkdownAnnotation<DeclarationType>>[] {
    annotations.push(SparkdownAnnotation.mark<DeclarationType>(type).range(from, to));
    return annotations;
  }

  override enter(
    annotations: Range<SparkdownAnnotation<DeclarationType>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<DeclarationType>>[] {
    if (nodeRef.name === "SceneDeclarationName") {
      return this.push(annotations, "scene", nodeRef.from, nodeRef.to);
    }
    if (nodeRef.name === "BranchDeclarationName") {
      return this.push(annotations, "branch", nodeRef.from, nodeRef.to);
    }
    if (nodeRef.name === "LabelDeclarationName") {
      return this.push(annotations, "label", nodeRef.from, nodeRef.to);
    }
    if (nodeRef.name === "LuauEndKeyword" && !nodeRef.node.parent?.parent) {
      return this.push(annotations, "end", nodeRef.from, nodeRef.to);
    }
    if (nodeRef.name === "LuauDefineName") {
      return this.push(annotations, "define", nodeRef.from, nodeRef.to);
    }
    if (
      nodeRef.name === "LuauFunctionName" &&
      ancestorMatching(nodeRef.node, FUNCTION_DECL_NAME)
    ) {
      return this.push(annotations, "function", nodeRef.from, nodeRef.to);
    }
    if (nodeRef.name === "LuauFunctionParameter") {
      return this.push(annotations, "param", nodeRef.from, nodeRef.to);
    }
    if (nodeRef.name === "LuauVariableName") {
      if (
        !ancestorMatching(nodeRef.node, VARIABLE_DECL_SITE, 6) &&
        !isBareDeclarationTarget(nodeRef.node)
      ) {
        return annotations;
      }
      if (isValueListName(nodeRef.node)) {
        return annotations;
      }
      const definition = ancestorMatching(nodeRef.node, VARIABLE_DEFINITION_NAMES);
      if (!definition) {
        return annotations;
      }
      const scopeNode = getDescendent("LuauScopeModifier", definition);
      const scope = scopeNode
        ? this.read(scopeNode.from, scopeNode.to).trim()
        : "";
      return this.push(
        annotations,
        scope === "const" ? "const" : "var",
        nodeRef.from,
        nodeRef.to,
      );
    }
    return annotations;
  }
}
