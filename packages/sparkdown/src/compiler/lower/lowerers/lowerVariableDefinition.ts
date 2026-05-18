import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ConstantDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { wrapInWeave } from "../utils/wrapInWeave";

export function lowerVariableDefinition(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const scopeNode = getDescendent("LuauScopeModifier", nodeRef.node);
  const scope = scopeNode ? ctx.read(scopeNode.from, scopeNode.to).trim() : "";

  // Collect all `LuauVariableAssignment` children. Sparkdown's
  // grammar parses `local a, b = expr` as TWO consecutive
  // `LuauVariableAssignment` nodes: the first holds only the
  // identifier `a` (followed by `ERROR_INCOMPLETE`), the second
  // holds `b` plus the `LuauAssignmentOperation`. Single-target
  // `local x = expr` produces just one.
  const contentNode = nodeRef.node.firstChild
    ? findContentChild(nodeRef.node, "LuauVariableDefinition_content")
    : null;
  const assignNodes: { node: any; name: string }[] = [];
  if (contentNode) {
    let child = contentNode.firstChild;
    while (child) {
      if (child.name === "LuauVariableAssignment") {
        const nameNode = getDescendent("LuauVariableName", child);
        if (nameNode) {
          assignNodes.push({
            node: child,
            name: ctx.read(nameNode.from, nameNode.to),
          });
        }
      }
      child = child.nextSibling;
    }
  }

  if (assignNodes.length === 0) {
    // Fallback: handle the legacy single-assignment-only shape
    // (e.g. when the content wrapper is absent in some edge cases).
    const assignNode = getDescendent("LuauVariableAssignment", nodeRef.node);
    if (!assignNode) return {};
    const nameNode = getDescendent("LuauVariableName", assignNode);
    if (!nameNode) return {};
    assignNodes.push({
      node: assignNode,
      name: ctx.read(nameNode.from, nameNode.to),
    });
  }

  // The RHS (assignment operator + value) lives on the LAST
  // `LuauVariableAssignment` — that's the one the grammar matched
  // an `LuauAssignmentOperation` against.
  const rhsAssignNode = assignNodes[assignNodes.length - 1]!.node;
  const opNode = getDescendent("LuauAssignmentOperation", rhsAssignNode);
  const expr = opNode ? lowerExpressionFromContainer(opNode, ctx) : null;

  // Multi-target assignment: route through `MultiVariableAssignment`
  // which emits the expression followed by `UnpackTuple(N)` + N
  // `RuntimeVariableAssignment`s. Single-target stays on the existing
  // `VariableAssignment` path. Only local-temp declarations are
  // supported in multi-target form; `const`/`store` multi-target is
  // deferred (constants don't make sense as multi-target, and
  // globals need separate registration plumbing).
  if (assignNodes.length > 1) {
    if (scope !== "local") return {};
    const targets = assignNodes.map(({ name }) => new Identifier(name));
    return wrapInWeave([new MultiVariableAssignment(targets, expr, true)]);
  }

  const identifier = new Identifier(assignNodes[0]!.name);

  // `const x = expr` → inkjs's `ConstantDeclaration`. The runtime
  // stores the expression in `story.constants` and resolves references
  // at compile time; reassignment fires inkjs's
  // "Cannot re-assign a const variable" diagnostic. Note: the
  // expression must be present (ConstantDeclaration's constructor
  // throws when accessing `.expression` if `_expression` is null), so
  // we fall back to a plain VariableAssignment if the parse didn't
  // produce one.
  if (scope === "const" && expr) {
    return wrapInWeave([new ConstantDeclaration(identifier, expr)]);
  }

  const isGlobal = scope === "store";
  const isTemp = scope === "local";

  const va = new VariableAssignment({
    variableIdentifier: identifier,
    assignedExpression: expr ?? undefined,
    isGlobalDeclaration: isGlobal,
    isTemporaryNewDeclaration: isTemp,
  });

  return wrapInWeave([va]);
}

function findContentChild(node: any, name: string): any | null {
  let child = node.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
}
