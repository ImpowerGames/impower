import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ConstantDeclaration } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Declaration/ConstantDeclaration";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
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

  const assignNode = getDescendent("LuauVariableAssignment", nodeRef.node);
  if (!assignNode) return {};

  const nameNode = getDescendent("LuauVariableName", assignNode);
  if (!nameNode) return {};
  const identifier = new Identifier(ctx.read(nameNode.from, nameNode.to));

  const opNode = getDescendent("LuauAssignmentOperation", assignNode);
  const expr = opNode ? lowerExpressionFromContainer(opNode, ctx) : null;

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
