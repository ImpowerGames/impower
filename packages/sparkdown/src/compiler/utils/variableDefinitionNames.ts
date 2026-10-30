import { isExplicitRuleName } from "./explicitRuleNames";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { nodeNameSet } from "./nodeNameSet";

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

export function ownAssignmentOperation(assignment: SyntaxNode): SyntaxNode | null {
  return (
    assignment
      .getChild(`${assignment.name}_content`)
      ?.getChild("LuauAssignmentOperation") ?? assignment
      .getChild(`${assignment.name}_content`)
      ?.getChild("LuauSparkdownExplicitAssignmentOperation") ?? assignment
      .getChild(`${assignment.name}_content`)
      ?.getChild("LuauSparkdownAssignmentOperation") ?? null
  );
}

export function nameOnlyAssignmentName(node: SyntaxNode): SyntaxNode | null {
  if (!isExplicitRuleName(node.name, "LuauVariableAssignment")) return null;
  const content = node.getChild(`${node.name}_content`);
  for (let child = content?.firstChild; child; child = child.nextSibling) {
    if (!child.name.includes("Comment") && !child.name.endsWith("Whitespace")) {
      return null;
    }
  }
  return assignmentListName(node);
}

export function assignmentListName(node: SyntaxNode): SyntaxNode | null {
  if (!isExplicitRuleName(node.name, "LuauVariableAssignment")) return null;
  const begin = node.getChild(`${node.name}_begin`);
  return begin ? (getDescendent("LuauVariableName", begin) ?? null) : null;
}

export function valueListAssignmentName(node: SyntaxNode): SyntaxNode | null {
  if (!node.parent || !VARIABLE_DEFINITION_CONTENT_NAMES.has(node.parent.name)) {
    return null;
  }
  const name = assignmentListName(node);
  if (!name) return null;
  for (let prev = node.prevSibling; prev; prev = prev.prevSibling) {
    if (isExplicitRuleName(prev.name, "LuauVariableAssignment") && ownAssignmentOperation(prev)) {
      return name;
    }
  }
  return null;
}

export function isValueListName(nameNode: SyntaxNode): boolean {
  for (let cur = nameNode.parent, depth = 0; cur && depth < 6; cur = cur.parent, depth++) {
    if (isExplicitRuleName(cur.name, "LuauVariableAssignment")) {
      return valueListAssignmentName(cur)?.from === nameNode.from;
    }
  }
  return false;
}
