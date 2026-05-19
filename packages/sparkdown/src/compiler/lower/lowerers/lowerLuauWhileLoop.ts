import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { VariableReference } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Variable/VariableReference";
import { Weave } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Weave";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { scanLoopUpvals } from "../expression/lowerExpression";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInWeave } from "../utils/wrapInWeave";

// `while cond do BODY end` — synthetic-knot recursion pattern.
//
// Compiles to a tail-recursive helper knot that captures any
// enclosing-scope variables referenced (or assigned) inside the
// condition + body, passes them as by-reference parameters, runs
// the body once if `cond` is true, and tail-calls itself. The
// recursion stops when `cond` becomes false; an implicit return
// then unwinds back to the loop's source position.
//
// Why by-reference for ALL captured variables: a loop body
// typically mutates the iteration variable (e.g. `n = n + 1`), and
// readers usually want the latest value. Passing everything by-ref
// lets the body read and write the enclosing scope transparently —
// inkjs's `VariablesState.Assign` and `GetVariableWithName` both
// dereference `VariablePointerValue` chains automatically, so the
// recursive call's pointers thread through to the originals at the
// loop source.
//
// V1 limitations:
//   - **JS stack growth**: each iteration pushes a call frame. The
//     runtime returns through every frame after the loop ends, so
//     loops with thousands of iterations may overflow. Acceptable
//     for narrative-fiction use cases; long-loop authors should
//     prefer numeric-for with smaller ranges or restructure.
//   - **No `break` / `continue`**: those need divert-based escape
//     and are deferred to a follow-up.
//   - **Conditional captures globals too**: any global referenced
//     inside the loop body is treated as an upval and passed
//     by-reference. The runtime's pointer-dereference handles it,
//     but the global ends up in the synthetic knot's parameter
//     list. Cosmetic, no correctness impact.

const WHILE_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauWhileCondition",
  "LuauWhileKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

export function lowerLuauWhileLoop(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  if (!ctx.hoistedKnots) return {};

  // Grammar shape: LuauWhileLoop > LuauWhileLoop_content > [ LuauWhileCondition, LuauDoBlock ].
  // The body lives inside LuauDoBlock > LuauDoBlock_content. Find both.
  const condNode = getDescendent("LuauWhileCondition", nodeRef.node);
  const doBlock = getDescendent("LuauDoBlock", nodeRef.node);
  const bodyContent = doBlock
    ? findChildByName(doBlock, "LuauDoBlock_content")
    : null;
  if (!condNode || !bodyContent) return {};

  // Free-variable scan over BOTH the condition and the body. The
  // condition references the iteration variable (e.g. `n < 10`),
  // and the body typically references the same plus any other
  // outer-scope state.
  const upvals = scanLoopUpvals(nodeRef.node, ctx);

  const synthName = `__while_${nodeRef.node.from}`;
  const knot = buildWhileKnot(synthName, condNode, bodyContent, upvals, ctx);
  ctx.hoistedKnots.push(knot);

  // At the loop's source position, emit a call that kicks off the
  // recursion. Args are simple variable references — inkjs's Divert
  // arg-binding code recognises the by-ref param declaration on the
  // callee and pushes `VariablePointerValue`s instead of evaluating.
  const callArgs = upvals.map(
    (name) => new VariableReference([new Identifier(name)]),
  );
  const call = new FunctionCall(new Identifier(synthName), callArgs);
  call.shouldPopReturnedValue = true;
  return wrapInWeave([call]);
}

function buildWhileKnot(
  name: string,
  condNode: SyntaxNode,
  bodyContent: SyntaxNode,
  upvals: string[],
  ctx: LowerContext,
): Knot {
  const args = upvals.map(
    (upvalName) => new Argument(new Identifier(upvalName), true, false),
  );

  const condExpr = lowerExpressionFromContainer(condNode, ctx);
  const bodyStatements = lowerStatements(bodyContent, ctx, WHILE_BODY_SKIP);

  // Tail-recursive call back to the same knot — passes the SAME by-ref
  // params, so the pointer chain keeps targeting the original outer
  // variables across iterations.
  const tailCallArgs = upvals.map(
    (upvalName) => new VariableReference([new Identifier(upvalName)]),
  );
  const tailCall = new FunctionCall(new Identifier(name), tailCallArgs);
  tailCall.shouldPopReturnedValue = true;

  const branchBody: ParsedObject[] = [...bodyStatements, tailCall];
  const branch = new ConditionalSingleBranch(branchBody);
  if (condExpr) branch.ownExpression = condExpr;
  branch.isElse = false;
  const conditional = new Conditional(null as never, [branch]);

  const knot = new Knot(new Identifier(name), [], args, true);
  const rootWeave = new Weave([conditional]);
  (knot as { _rootWeave?: Weave })._rootWeave = rootWeave;
  knot.AddContent(rootWeave);
  return knot;
}
