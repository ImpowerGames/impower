import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { ancestorMatching } from "../../utils/ancestorMatching";
import { nodeNameSet } from "../../utils/nodeNameSet";
import {
  VARIABLE_DEFINITION_CONTENT_NAMES,
  VARIABLE_DEFINITION_NAMES,
  isValueListName,
  ownAssignmentOperation,
} from "../../utils/variableDefinitionNames";
import { soleVariableName } from "../../lint/luauTree";
import { Range } from "@codemirror/state";
import { type SyntaxNode } from "@lezer/common";
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
const ACCESS_PATH = nodeNameSet(["LuauAccessPath"]);
const BEFORE_BARE_TARGET = nodeNameSet([
  "LuauVariableAssignment",
  "LuauAccessPath",
  "LuauCommaSeparator",
  "LuauCommaLineBreak",
  "OptionalWhitespace",
  "ExtraWhitespace",
  "RequiredWhitespace",
]);

function isBareDeclarationTarget(node: SyntaxNode | undefined): boolean {
  const path = ancestorMatching(node, ACCESS_PATH, 6);
  if (!path?.parent || !VARIABLE_DEFINITION_CONTENT_NAMES.has(path.parent.name)) {
    return false;
  }
  if (soleVariableName(path)?.from !== node?.from) return false;
  for (let prev = path.prevSibling; prev; prev = prev.prevSibling) {
    if (!BEFORE_BARE_TARGET.has(prev.name)) return false;
    if (isExplicitRuleName(prev.name, "LuauVariableAssignment") && ownAssignmentOperation(prev)) {
      return false;
    }
  }
  return true;
}
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
