import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { BinaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/BinaryExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { MultiVariableAssignment } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/MultiVariableAssignment";
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
import { validateExplicitStatement } from "../utils/validateExplicitStatement";
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

  // Stylistic diagnostic: inside a function body, the `&` prefix is
  // redundant. Route via `ctx.diagnostics` so it survives the
  // unwrapping in `lowerStatements`/`appendBlockContent` (which only
  // copies `content`, not `diagnostics`, from nested blocks).
  const diagnostics = validateExplicitStatement(nodeRef.node, ctx);
  if (diagnostics.length > 0 && ctx.diagnostics) {
    ctx.diagnostics.push(...diagnostics);
  }

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

  // Multi-target reassignment detection: `& a, b = 99, 100` (and the
  // single-RHS multi-target variant `& a, b = f()`). The grammar
  // includes `LuauCommaSeparator` in `LuauExplicitStatement`'s
  // patterns specifically to let multi-target statements parse —
  // they appear as a flat sequence at the statement-content level:
  //
  //   LuauAccessPath (target 1)
  //   LuauCommaSeparator
  //   LuauAccessPath (target 2)
  //   …
  //   LuauAssignmentOperation (= <first RHS>)
  //   LuauCommaSeparator
  //   <RHS expression>
  //   …
  //
  // Single-target statements (no comma before the assignment op)
  // fall through to the existing path below.
  const multiTargetResult = tryLowerMultiTargetReassignment(nodeRef.node, ctx);
  if (multiTargetResult) return multiTargetResult;

  const lhsPath = getDescendent("LuauAccessPath", nodeRef.node);
  if (!lhsPath) return {};
  // Look for the assignment operator as a SIBLING of `lhsPath`, not a
  // descendant — `getDescendent` is greedy and would otherwise walk into
  // the access path itself (e.g. into a table literal inside call args
  // like `& host_record({year = 2026})`) and surface the inner key
  // `year = 2026` as the statement-level op, misclassifying the whole
  // statement as `host_record = 2026`.
  let opNode: SyntaxNode | null = null;
  let sib: SyntaxNode | null = lhsPath.nextSibling;
  while (sib) {
    if (sib.name === "LuauAssignmentOperation") {
      opNode = sib;
      break;
    }
    sib = sib.nextSibling;
  }

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
  if (propertyAssignment) return wrapInWeave(propertyAssignment);

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

// Walk the explicit statement's content children. If there's at least
// one comma BEFORE a `LuauAssignmentOperation`, treat the leading
// access paths as multi-target reassignments and route through
// `MultiVariableAssignment`. Returns `null` (and lets the caller take
// the single-target path) for any other shape: single target, bare
// call, function-call with parenthetical sibling, etc.
function tryLowerMultiTargetReassignment(
  stmtNode: SyntaxNode,
  ctx: LowerContext,
): CompiledBlock | null {
  const content = findChildByName(stmtNode, "LuauExplicitStatement_content");
  if (!content) return null;

  // First pass: scan for the assignment op and decide whether to take
  // the multi-target path. Multi-target requires at least one comma
  // BEFORE the assignment op.
  const targets: SyntaxNode[] = [];
  let opNode: SyntaxNode | null = null;
  let sawCommaBeforeOp = false;
  let child = content.firstChild;
  while (child) {
    if (isSkippableName(child.name)) {
      child = child.nextSibling;
      continue;
    }
    if (child.name === "LuauAssignmentOperation") {
      opNode = child;
      break;
    }
    if (child.name === "LuauCommaSeparator") {
      sawCommaBeforeOp = true;
    } else if (child.name === "LuauAccessPath") {
      targets.push(child);
    } else {
      // Any other node before the op — bail. Could be a parenthetical
      // sibling for method calls, etc. The single-target path handles
      // those.
      return null;
    }
    child = child.nextSibling;
  }
  if (!opNode || !sawCommaBeforeOp || targets.length < 2) return null;

  // Resolve each target's identifier. Only simple-name targets are
  // supported in V1 (no `obj.field` multi-targets) — that pattern
  // would route to `lowerPropertyTargetAssignment` per-target and
  // is more involved.
  const targetIdents: Identifier[] = [];
  for (const tNode of targets) {
    const nameNode = getDescendent("LuauVariableName", tNode);
    if (!nameNode) return null;
    targetIdents.push(new Identifier(ctx.read(nameNode.from, nameNode.to)));
  }

  // Collect RHS expressions: the first from the assignment op, and any
  // trailing expressions that appear after the op (separated by commas).
  const firstRhs = lowerExpressionFromContainer(opNode, ctx);
  const trailingGroups: SyntaxNode[][] = [];
  let trailingGroup: SyntaxNode[] = [];
  let trailing = opNode.nextSibling;
  while (trailing) {
    if (isSkippableName(trailing.name)) {
      trailing = trailing.nextSibling;
      continue;
    }
    if (trailing.name === "LuauCommaSeparator") {
      if (trailingGroup.length > 0) {
        trailingGroups.push(trailingGroup);
        trailingGroup = [];
      }
    } else {
      trailingGroup.push(trailing);
    }
    trailing = trailing.nextSibling;
  }
  if (trailingGroup.length > 0) trailingGroups.push(trailingGroup);

  const trailingExprs = trailingGroups
    .map((nodes) => lowerExpressionFromNodes(nodes, ctx))
    .filter((e): e is NonNullable<typeof e> => e != null);
  const expressions = firstRhs ? [firstRhs, ...trailingExprs] : trailingExprs;

  // Reassignment — `isTemporaryNewDeclaration: false` so the child
  // VariableAssignments don't register new declarations but reassign
  // existing variables. The runtime `RuntimeVariableAssignment` reads
  // this flag to decide whether to allocate a new temp slot or
  // overwrite an existing one.
  return wrapInWeave([
    new MultiVariableAssignment(targetIdents, expressions, false),
  ]);
}

function isSkippableName(name: string): boolean {
  return (
    name === "ExtraWhitespace" ||
    name === "Whitespace" ||
    name === "Newline" ||
    name === "LuauComment" ||
    name === "OptionalWhitespace" ||
    name === "RequiredWhitespace"
  );
}

function findChildByName(parent: SyntaxNode, name: string): SyntaxNode | null {
  let child = parent.firstChild;
  while (child) {
    if (child.name === name) return child;
    child = child.nextSibling;
  }
  return null;
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
