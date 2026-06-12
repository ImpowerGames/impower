import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { VariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableAssignment";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { lowerPropertyTargetAssignment } from "../utils/lowerPropertyTargetAssignment";
import { wrapInWeave } from "../utils/wrapInWeave";

// Lower a bare reassignment statement from its constituent grammar nodes —
// an `LuauAccessPath` (the target) and an immediately-following
// `LuauAssignmentOperation` sibling (the operator + RHS). Both pieces come
// from the *caller* (`lowerStatements`) which detected the sibling pair;
// there is no dedicated `LuauReassignment` grammar node.
//
// This mirrors how Lua's recursive-descent parser disambiguates assignment
// from expression-statement: it parses a suffixed expression first, then
// checks whether `=` follows. By doing the detection at the lowerer level,
// we get the same flexibility for free — any access-path shape the grammar
// produces (dotted chains, bracket indexers, mixed) can be the LHS.
//
// Forms handled:
//   total = total + i             (simple identifier target)
//   count += 1                    (compound, desugared to `count = count + 1`)
//   obj.field = value             (property-target → StorePropertyAssignment)
//   this.is["a"].access.path = v  (arbitrary mixed access path)
export function lowerReassignment(
  lhsPath: SyntaxNode,
  opNode: SyntaxNode,
  ctx: LowerContext,
): CompiledBlock {
  const opText = readAssignmentOperatorText(opNode, ctx);

  // Multi-segment LHS → property-target via StorePropertyAssignment.
  const propertyAssignment = lowerPropertyTargetAssignment(
    lhsPath,
    opNode,
    opText,
    ctx,
  );
  if (propertyAssignment) return wrapInWeave(propertyAssignment);

  // Simple identifier LHS → VariableAssignment kind=reassign. The
  // grammar tags identifiers whose text matches a stdlib namespace
  // (`count`, `math`, ...) or stdlib global (`assert`, `print`, ...)
  // as `LuauStdLibConstants` / `LuauStdLibFunctions` instead of
  // `LuauVariableName`, so we look for either. Without this, a
  // closure body reassigning a locally-shadowed `count = count + 1`
  // would silently produce no VariableAssignment and the write would
  // disappear.
  // `self` is grammar-tagged `LuauSelfKeyword` even in plain
  // identifier position — outside a method body it's an ordinary
  // variable in Lua (`self = 20` at chunk level, calls.luau line
  // 33), so accept it as an assignment target too.
  const nameNode =
    getDescendent("LuauVariableName", lhsPath) ??
    getDescendent("LuauStdLibConstants", lhsPath) ??
    getDescendent("LuauStdLibFunctions", lhsPath) ??
    getDescendent("LuauSelfKeyword", lhsPath);
  if (!nameNode) return {};
  const variableName = ctx.read(nameNode.from, nameNode.to);
  const identifier = new Identifier(variableName);

  // `f = <expr>` REBINDS the name to a runtime value (Lua's
  // `function f` is itself sugar for this kind of assignment —
  // vararg.luau line 155 reassigns the twice-defined `f` to a fresh
  // function value). For names that are NOT already locals (bare
  // globals and former sibling subflows), record the rebind in the
  // sibling registry — consulted in lexical order during lowering,
  // so earlier call sites keep their original binding:
  //   - any stale subflow entries are dropped (subsequent `f(...)`
  //     must not statically divert to the old knot);
  //   - the `rebound` marker makes subsequent calls value-dispatch
  //     through the variable (CallValueExpression carries the
  //     call-site arg count the runtime needs to pack `...` args)
  //     while still suppressing upval capture — a closure
  //     referencing a bare-assigned GLOBAL (`self = 20` then
  //     `function a.y (x) return x+self end` — calls.luau line 34)
  //     reads the global, it doesn't capture a pointer.
  // Already-local names skip all of this: their dispatch is value-
  // call via declaredLocals anyway, and registering them here would
  // wrongly suppress their upval capture.
  const isKnownLocal =
    ctx.declaredLocalsStack?.some((f) => f.has(variableName)) ?? false;
  if (!isKnownLocal && ctx.siblingSubFlowNamesStack) {
    for (const frame of ctx.siblingSubFlowNamesStack) {
      frame.delete(variableName);
    }
    ctx.siblingSubFlowNamesStack.at(-1)?.set(variableName, {
      upvals: [],
      arity: -1,
      knotName: variableName,
      rebound: true,
    });
  }

  let expr = lowerExpressionFromContainer(opNode, ctx);

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
