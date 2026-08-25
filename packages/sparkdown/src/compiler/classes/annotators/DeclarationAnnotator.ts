import { Range } from "@codemirror/state";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
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
  | "param";

// Bounded parent walk: nearest ancestor whose name is in `names`, else null.
// Bounded so a pathological parent chain stays O(1), not O(file).
function ancestorMatching(
  node: { parent?: any } | undefined,
  names: Set<string>,
  max = 10,
): any {
  let cur = node?.parent;
  for (let depth = 0; depth < max && cur; depth++) {
    if (names.has(cur.name)) return cur;
    cur = cur.parent;
  }
  return null;
}

const VARIABLE_DECL_SITE = new Set(["LuauVariableAssignment_begin"]);
const VARIABLE_DEFINITION = new Set(["LuauVariableDefinition"]);
const FUNCTION_DECL_NAME = new Set(["LuauFunctionDeclarationName"]);

// Records the NAME span of each declaration as a flat `(type, range)` mark in
// the `declarations` channel, consumed by the document outline
// (getDocumentSymbols) and scope-aware completion (getDeclarationScopes).
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
      if (!ancestorMatching(nodeRef.node, VARIABLE_DECL_SITE, 6)) {
        return annotations;
      }
      const definition = ancestorMatching(nodeRef.node, VARIABLE_DEFINITION);
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
