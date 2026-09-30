import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { nodeNameSet } from "./nodeNameSet";

// A `local`, `store` or `const` declaration: `LuauVariableDefinition` in Luau
// code, where a comma that ends the line continues the list on the next
// line, and `LuauSparkdownVariableDefinition` in a narrative body, where the
// declaration ends at its line. Both have the same begin, content and end,
// so their wrapper nodes are `<name>_begin`, `<name>_content` and
// `<name>_end`.
export const VARIABLE_DEFINITION_NAMES = nodeNameSet([
  "LuauVariableDefinition",
  "LuauSparkdownVariableDefinition",
]);

export const VARIABLE_DEFINITION_CONTENT_NAMES = nodeNameSet([
  "LuauVariableDefinition_content",
  "LuauSparkdownVariableDefinition_content",
]);

export const VARIABLE_DEFINITION_BEGIN_NAMES = nodeNameSet([
  "LuauVariableDefinition_begin",
  "LuauSparkdownVariableDefinition_begin",
]);

export const VARIABLE_DEFINITION_END_NAMES = nodeNameSet([
  "LuauVariableDefinition_end",
  "LuauSparkdownVariableDefinition_end",
]);

// A `LuauVariableAssignment`'s own `=`: the assignment operation directly in
// its content, next to its type annotation. An `=` nested in that type
// (`local a: typeof({ k = 1 })`) is part of the type, not the declaration's.
export function ownAssignmentOperation(assignment: SyntaxNode): SyntaxNode | null {
  return (
    assignment
      .getChild("LuauVariableAssignment_content")
      ?.getChild("LuauAssignmentOperation") ?? null
  );
}

// The name of a `LuauVariableAssignment` that holds nothing but its name (no
// type annotation, no `=`), or null for any other node.
export function nameOnlyAssignmentName(node: SyntaxNode): SyntaxNode | null {
  if (node.name !== "LuauVariableAssignment") return null;
  if (node.getChild("LuauVariableAssignment_content")) return null;
  return getDescendent("LuauVariableName", node) ?? null;
}

// The name of a `LuauVariableAssignment` that is a VALUE in its
// declaration's list, not a target (#1116). The grammar reads any name
// before a comma or the end of its line as a target-shaped assignment, so
// in `local a, b = 1, x` the `x` is one too. It is a value when it holds
// only its name and an earlier assignment in the same declaration took the
// list's `=`. The annotators and the closure scan ask here. The lowerer's
// list walk and the lints' `declaredNames` walk the list in order instead,
// switching to values (or stopping) at the first `ownAssignmentOperation`,
// which is the same rule.
//
// The answer depends on earlier siblings, so an incremental re-annotation
// that ends inside a declaration runs to its end
// (`SparkdownCombinedAnnotator.update`).
export function valueListAssignmentName(node: SyntaxNode): SyntaxNode | null {
  if (!node.parent || !VARIABLE_DEFINITION_CONTENT_NAMES.has(node.parent.name)) {
    return null;
  }
  const name = nameOnlyAssignmentName(node);
  if (!name) return null;
  for (let prev = node.prevSibling; prev; prev = prev.prevSibling) {
    if (prev.name === "LuauVariableAssignment" && ownAssignmentOperation(prev)) {
      return name;
    }
  }
  return null;
}

// Whether a `LuauVariableName` is the name of a value-list assignment
// (`x` in `local a, b = 1, x`): it sits at a declaration-shaped site but is
// read, not declared.
export function isValueListName(nameNode: SyntaxNode): boolean {
  for (let cur = nameNode.parent, depth = 0; cur && depth < 6; cur = cur.parent, depth++) {
    if (cur.name === "LuauVariableAssignment") {
      return valueListAssignmentName(cur)?.from === nameNode.from;
    }
  }
  return false;
}
