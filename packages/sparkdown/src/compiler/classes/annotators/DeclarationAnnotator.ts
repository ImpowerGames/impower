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
  // A root-level `end`. It declares nothing; in a well-formed script it closes
  // the innermost open scene or branch, so a walk over this channel can pair
  // each scene and branch with its end. A stray `end` is marked too and closes
  // nothing, so consumers must not assume the marks balance.
  | "end";

const VARIABLE_DECL_SITE = nodeNameSet(["LuauVariableAssignment_begin"]);
const ACCESS_PATH = nodeNameSet(["LuauAccessPath"]);
// What can come before a bare declaration target in its definition: earlier
// targets, their separators and whitespace, but no assignment.
const BEFORE_BARE_TARGET = nodeNameSet([
  "LuauVariableAssignment",
  "LuauAccessPath",
  "LuauCommaSeparator",
  "LuauCommaLineBreak",
  "OptionalWhitespace",
  "ExtraWhitespace",
  "RequiredWhitespace",
]);

// A declaration with no initializer that another statement follows on the
// same line (`local a return a`, `local a if a then … end`): the grammar
// writes its name as a bare access path in the definition's content rather
// than as an assignment, as `lowerVariableDefinition` reads it. A path after
// an `=` is a value, not a target.
function isBareDeclarationTarget(node: SyntaxNode | undefined): boolean {
  const path = ancestorMatching(node, ACCESS_PATH, 6);
  if (!path?.parent || !VARIABLE_DEFINITION_CONTENT_NAMES.has(path.parent.name)) {
    return false;
  }
  if (soleVariableName(path)?.from !== node?.from) return false;
  for (let prev = path.prevSibling; prev; prev = prev.prevSibling) {
    if (!BEFORE_BARE_TARGET.has(prev.name)) return false;
    if (prev.name === "LuauVariableAssignment" && ownAssignmentOperation(prev)) {
      return false;
    }
  }
  return true;
}
const FUNCTION_DECL_NAME = nodeNameSet(["LuauFunctionDeclarationName"]);

// Records the NAME span of each declaration as a flat `(type, range)` mark in
// the `declarations` channel, plus an `end` mark for each root-level `end`.
// The channel is consumed by the document outline (getDocumentSymbols),
// folding (getFoldingRanges), declaration locations
// (SparkdownCompiler.populateDeclarationLocations) and scope-aware completion
// (getDeclarationScopes); each pairs an `end` with the scene or branch it
// closes.
//
// Migrated to the post-Luau-port grammar: declarations are now `LuauFunctionName`
// (under LuauFunctionDeclarationName), `LuauVariableName` (under a
// LuauVariableDefinition — `store`/`local`/`const`), `LuauFunctionParameter`,
// and `LuauDefineName` (define/screen/component/style/animation/theme — they
// share the define-name node). Scene/branch/label beats were already on the
// current grammar nodes. The pre-port `knot`/`stitch`/`temp`/`list` constructs
// no longer exist in the grammar and were removed from DeclarationType.
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
    // Narrative beats (already on current grammar nodes).
    if (nodeRef.name === "SceneDeclarationName") {
      return this.push(annotations, "scene", nodeRef.from, nodeRef.to);
    }
    if (nodeRef.name === "BranchDeclarationName") {
      return this.push(annotations, "branch", nodeRef.from, nodeRef.to);
    }
    if (nodeRef.name === "LabelDeclarationName") {
      return this.push(annotations, "label", nodeRef.from, nodeRef.to);
    }
    // `Scene` and `Branch` cover only their declaration line, so the `end`
    // that closes one is a sibling at the root. An `end` nested deeper closes
    // a function, loop or `if` block instead.
    if (nodeRef.name === "LuauEndKeyword" && !nodeRef.node.parent?.parent) {
      return this.push(annotations, "end", nodeRef.from, nodeRef.to);
    }
    // Define-family name (`define`/`screen`/`component`/`style`/`animation`/
    // `theme` all introduce their name via LuauDefineName, only at the
    // declaration — references elsewhere are access paths/variable names).
    if (nodeRef.name === "LuauDefineName") {
      return this.push(annotations, "define", nodeRef.from, nodeRef.to);
    }
    // Function declaration: the name node `LuauFunctionName` also fires at
    // call sites, so only emit when it sits under a LuauFunctionDeclarationName.
    if (
      nodeRef.name === "LuauFunctionName" &&
      ancestorMatching(nodeRef.node, FUNCTION_DECL_NAME)
    ) {
      return this.push(annotations, "function", nodeRef.from, nodeRef.to);
    }
    // Function parameter name.
    if (nodeRef.name === "LuauFunctionParameter") {
      return this.push(annotations, "param", nodeRef.from, nodeRef.to);
    }
    // Variable declaration: `LuauVariableName` fires at both declaration and
    // reference sites. Emit only for the LHS of a `store`/`local`/`const`
    // DEFINITION — i.e. nested in LuauVariableAssignment_begin AND inside a
    // LuauVariableDefinition (a bare reassignment `x = …` has the former but
    // not the latter, so it's correctly excluded). const vs var comes from the
    // definition's LuauScopeModifier.
    if (nodeRef.name === "LuauVariableName") {
      if (
        !ancestorMatching(nodeRef.node, VARIABLE_DECL_SITE, 6) &&
        !isBareDeclarationTarget(nodeRef.node)
      ) {
        return annotations;
      }
      // A value in the list (`x` in `local a, b = 1, x`) declares nothing.
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
