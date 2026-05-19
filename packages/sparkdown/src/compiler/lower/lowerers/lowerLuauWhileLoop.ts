import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Argument } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Argument";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { Knot } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Knot";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Stitch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Stitch";
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

// `while cond do BODY end` — compiles to a synthetic knot whose body
// is a STITCH that the loop's test+body+tail-divert lives inside.
// One call frame per loop entry, not one per iteration.
//
// Shape:
//
//   function __while_<offset>(*by-ref upvals*)   ← param binding runs ONCE on entry
//     -> loop                                     ← jump into the stitch
//     = loop                                       ← named stitch within the knot
//       if cond then
//         BODY
//         -> loop                                 ← non-function divert; same frame
//       end
//   end
//
// Why this avoids the JS stack growth that the older "FunctionCall
// tail-recurse" pattern had: the tail `-> loop` is a plain Divert
// (default `isFunctionCall = false`), which compiles to a runtime
// `Divert` with `pushesToStack = false`. The runtime just sets
// `state.divertedPointer` and continues — no `callStack.Push`. The
// call frame established when the outer code first entered
// `__while_<offset>` persists across every iteration, so:
//   - Temps (the upval `VariablePointerValue`s) stay live across the
//     jump; reads and writes inside the body keep dereferencing the
//     same outer-scope variables.
//   - Param binding runs ONCE at the knot's entry, not per iteration.
//   - Loop exit (cond falsy) falls off the end of the knot, which
//     auto-emits a `PopFunction` — a single return to the caller.
//
// V1 limitations:
//   - **No `break` / `continue`**: those need an extra divert target
//     past the loop and a tag-based escape from nested ifs/loops.
//     Deferred.
//   - **No numeric `for i = 1, 10`**: same structural pattern would
//     work — initial param holds the counter, body increments via
//     the by-ref slot, condition checks against the end value.
//   - **No generic `for k, v in pairs(t)`**: needs the iterator
//     protocol on top of loops.

const WHILE_BODY_SKIP: ReadonlySet<string> = new Set([
  "LuauWhileCondition",
  "LuauWhileKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

const LOOP_STITCH_NAME = "loop";

export function lowerLuauWhileLoop(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  if (!ctx.hoistedKnots) return {};

  // Grammar shape: LuauWhileLoop > LuauWhileLoop_content > [ LuauWhileCondition, LuauDoBlock ].
  // The body lives inside LuauDoBlock > LuauDoBlock_content.
  const condNode = getDescendent("LuauWhileCondition", nodeRef.node);
  const doBlock = getDescendent("LuauDoBlock", nodeRef.node);
  const bodyContent = doBlock
    ? findChildByName(doBlock, "LuauDoBlock_content")
    : null;
  if (!condNode || !bodyContent) return {};

  // Free-variable scan over the condition AND the body. All such
  // names become by-reference parameters on the synthetic knot so
  // the body can read AND mutate the outer scope's locals.
  const upvals = scanLoopUpvals(nodeRef.node, ctx);

  const synthName = `__while_${nodeRef.node.from}`;
  const knot = buildWhileKnot(synthName, condNode, bodyContent, upvals, ctx);
  ctx.hoistedKnots.push(knot);

  // At the loop's source position, emit a single call that enters
  // the synthetic knot. The args are simple variable references —
  // inkjs's Divert arg-handling reads the callee's by-ref params and
  // emits `VariablePointerValue`s for each one.
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

  // Tail-jump: a plain `Divert` (not a `FunctionCall`) to the stitch
  // named `loop` inside this same knot. Runtime treats this as a
  // pointer move in the existing call frame — no stack push.
  const tailDivert = new Divert([new Identifier(LOOP_STITCH_NAME)]);

  const branchBody: ParsedObject[] = [...bodyStatements, tailDivert];
  const branch = new ConditionalSingleBranch(branchBody);
  if (condExpr) branch.ownExpression = condExpr;
  branch.isElse = false;
  const conditional = new Conditional(null as never, [branch]);

  // The stitch is the knot's ONLY child content — when the synthetic
  // knot is called, param binding runs, and then execution falls
  // straight into the stitch (the stitch sits at the knot's first
  // content slot). When the conditional resolves to false, the
  // stitch's flow ends, control falls through to the end of the
  // knot, and `FlowBase`'s implicit `PopFunction` returns to the
  // caller.
  //
  // We mark the stitch as `isFunction = true` so its own implicit
  // return semantics align with the outer function flow — without
  // this, the runtime treats the stitch's flow-end as a regular
  // sub-flow terminator rather than a return, leaving `canContinue`
  // false but never popping the function frame.
  const stitch = new Stitch(
    new Identifier(LOOP_STITCH_NAME),
    [],
    [],
    true,
  );
  const stitchWeave = new Weave([conditional]);
  (stitch as { _rootWeave?: Weave })._rootWeave = stitchWeave;
  stitch.AddContent(stitchWeave);

  // Knot with an empty initial weave — same shape `SparkdownCompiler`
  // builds for user-authored knots before stitches get added. We then
  // mirror its "drop the empty weave when a stitch arrives" step so
  // execution flows: enter knot → bind args → enter stitch directly.
  const knot = new Knot(new Identifier(name), [], args, true);
  const emptyRootWeave = new Weave([]);
  (knot as { _rootWeave?: Weave })._rootWeave = emptyRootWeave;
  knot.AddContent(emptyRootWeave);

  if (stitch.identifier?.name) {
    knot.subFlowsByName.set(stitch.identifier.name, stitch);
  }
  // Pop the empty weave so the stitch becomes the knot's first
  // content slot — entering the knot lands directly on the stitch.
  if (
    knot.content.length === 1 &&
    knot.content[0] instanceof Weave &&
    (knot.content[0] as Weave).content.length === 0
  ) {
    knot.content.pop();
  }
  knot.AddContent(stitch);

  return knot;
}
