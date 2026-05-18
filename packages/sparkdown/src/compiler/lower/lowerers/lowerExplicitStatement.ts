import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import {
  lowerExpressionFromContainer,
  lowerExpressionFromNodes,
} from "../expression/lowerExpression";
import { lowerPropertyTargetAssignment } from "../utils/lowerPropertyTargetAssignment";
import { wrapInWeave } from "../utils/wrapInWeave";
import { lowerVariableDefinition } from "./lowerVariableDefinition";

export function lowerExplicitStatement(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  // `& x = expr` — assign expr to variable x.
  // `& x += expr` — compound assignment, desugared to `x = x + expr`.
  // `& obj.field = expr` — property-target assignment, mutates the
  // ObjectValue stored in `obj` via StorePropertyAssignment.
  // `& store x = expr` / `& const x = expr` / `& local x = expr` —
  // declaration with explicit `&` prefix; delegated to `lowerVariableDefinition`
  // since the grammar wraps the declaration in a nested `LuauVariableDefinition`
  // node.
  // `& foo()` — bare function-call statement: evaluate for side effects
  // and discard the return value. Lowered to a `FunctionCall` Expression
  // with `shouldPopReturnedValue = true` so the runtime pops the unused
  // return off the eval stack.

  const varDef = getDescendent("LuauVariableDefinition", nodeRef.node);
  if (varDef) {
    // Re-route through the regular variable-definition lowerer so explicit
    // (`& store x = 5`) and implicit (`store x = 5`) forms produce
    // identical bytecode.
    return lowerVariableDefinition(
      varDef as unknown as SparkdownSyntaxNodeRef,
      ctx,
    );
  }

  const lhsPath = getDescendent("LuauAccessPath", nodeRef.node);
  const opNode = getDescendent("LuauAssignmentOperation", nodeRef.node);
  if (!lhsPath) return {};

  // Bare function-call statement (no assignment operator). Lower the
  // access path as an expression; if it resolves to a `FunctionCall`,
  // flip `shouldPopReturnedValue` and emit it as a top-level
  // statement. Non-function-call bare expressions (e.g. `& foo` or
  // `& 1 + 2`) have no side effect on the output stream and are
  // dropped silently — matching ink's behaviour where only the
  // call form is meaningful as a statement.
  if (!opNode) {
    // Treat the whole `LuauAccessPath` as a single primary node —
    // `lowerExpressionFromContainer` would skip past the access path
    // wrapper and walk its children (which don't include primaries),
    // returning null. `lowerExpressionFromNodes([path])` routes the
    // node through `lowerAccessPath` which returns a `FunctionCall`
    // when the path is a single call form.
    //
    // Method-call shape: `& table.insert(t, 40)` parses the access
    // path (`table.insert`) and the call args (`(t, 40)`) as
    // ADJACENT siblings — `LuauAccessPath` ending in
    // `LuauFunctionAccessor`, followed by `LuauParenthetical`. The
    // grammar uses the same `LuauFunctionAccessor` rule for `.` and
    // `:`, so namespaced stdlib calls (`table.insert`, `math.floor`)
    // travel this path too. `lowerExpressionFromNodes`'s method-call
    // combining only fires when both nodes are in the input list —
    // pass any sibling parenthetical alongside the access path.
    const nodes: SyntaxNode[] = [lhsPath];
    let next: SyntaxNode | null = lhsPath.nextSibling;
    while (next && next.name !== "LuauParenthetical") {
      next = next.nextSibling;
    }
    if (next) nodes.push(next);
    const callExpr = lowerExpressionFromNodes(nodes, ctx);
    if (callExpr instanceof FunctionCall) {
      callExpr.shouldPopReturnedValue = true;
      return wrapInWeave([callExpr]);
    }
    return {};
  }

  const opText = readAssignmentOperatorText(opNode, ctx);

  // Multi-segment LHS (`obj.field` etc.) — route to property-target lowering.
  const propertyAssignment = lowerPropertyTargetAssignment(
    lhsPath,
    opNode,
    opText,
    ctx,
  );
  if (propertyAssignment) return wrapInWeave([propertyAssignment]);

  const nameNode = getDescendent("LuauVariableName", lhsPath);
  if (!nameNode) return {};
  const variableName = ctx.read(nameNode.from, nameNode.to);
  const identifier = new Identifier(variableName);

  let expr = lowerExpressionFromContainer(opNode, ctx);

  // Compound assignment desugaring (V1 supports the value operators).
  if (opText && opText !== "=" && expr) {
    const binOp = opText.slice(0, -1);
    const lhsRef = new VariableReference([new Identifier(variableName)]);
    expr = new BinaryExpression(lhsRef, expr, binOp);
  }

  const va = new VariableAssignment({
    variableIdentifier: identifier,
    assignedExpression: expr ?? undefined,
  });
  return wrapInWeave([va]);
}

function readAssignmentOperatorText(
  opNode: SyntaxNode,
  ctx: LowerContext,
): string | null {
  const marker = getDescendent("LuauAssignmentOperator", opNode);
  if (!marker) return null;
  // `LuauAssignmentOperator`'s begin pattern is
  // `({{WS}}*)({{LUAU_ASSIGNMENT_OPERATORS}})({{WS}}*)` — the marker
  // node only contains optional whitespace + the op + optional
  // whitespace, so trim is enough to yield the operator text.
  return ctx.read(marker.from, marker.to).trim();
}
