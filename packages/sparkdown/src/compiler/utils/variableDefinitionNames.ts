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

function childNamed(parent: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = parent.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
  }
  return null;
}

// A `LuauVariableAssignment`'s own `=`: the assignment operation directly in
// its content, next to its type annotation. An `=` nested in that type
// (`local a: typeof({ k = 1 })`) is part of the type, not the declaration's.
export function ownAssignmentOperation(assignment: SyntaxNode): SyntaxNode | null {
  const content = childNamed(assignment, "LuauVariableAssignment_content");
  return content ? childNamed(content, "LuauAssignmentOperation") : null;
}

// The name of a `LuauVariableAssignment` that is a VALUE in its
// declaration's list, not a target (#1116). The grammar reads any name
// before a comma or the end of its line as a target-shaped assignment, so
// in `local a, b = 1, x` the `x` is one too. It is a value when it holds
// only its name and an earlier assignment in the same declaration took the
// list's `=`. Every reader that asks "does this declare a name?" asks here.
export function valueListAssignmentName(node: SyntaxNode): SyntaxNode | null {
  if (node.name !== "LuauVariableAssignment") return null;
  if (!node.parent || !VARIABLE_DEFINITION_CONTENT_NAMES.has(node.parent.name)) {
    return null;
  }
  if (childNamed(node, "LuauVariableAssignment_content")) return null;
  for (let prev = node.prevSibling; prev; prev = prev.prevSibling) {
    if (prev.name === "LuauVariableAssignment" && ownAssignmentOperation(prev)) {
      return getDescendent("LuauVariableName", node) ?? null;
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
