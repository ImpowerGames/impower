import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { NativeFunctionCall } from "../../../inkjs/engine/NativeFunctionCall";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerExpressionFromContainer } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";

// `while cond do BODY end` — compiles to a labeled Gather living at
// the loop's source position in the enclosing weave. The tail-jump is
// a plain `Divert` to that gather's label; the loop runs in the
// caller's call frame, so the body sees and mutates outer locals
// directly with no parameter passing.
//
// Shape (parsed):
//
//   - (__while_<offset>_loop)
//     { cond:
//       BODY
//       -> __while_<offset>_loop
//     }
//
// Why this works without a synthetic knot / stitch:
//
//   - The labeled `Gather` auto-enters when execution reaches it,
//     since no choices precede it in the parent weave.
//   - The `Conditional` is the gather's only content. When `cond` is
//     true, the body runs and the tail `Divert` jumps back to the
//     start of the gather (re-evaluating `cond`). When `cond` is
//     false, the conditional emits nothing and execution falls
//     through to whatever follows the loop in the parent flow.
//   - The `Divert` is not a function call (`isFunctionCall = false`),
//     so the runtime moves the instruction pointer without pushing a
//     new call frame. Outer locals stay live across iterations.
//   - Path resolution from the divert walks up
//     `Divert → ConditionalSingleBranch → Conditional → Gather →
//     parent Weave` and finds the gather via the weave's
//     `namedWeavePoints`. `FlowBase.ResolveWeavePointNaming` populates
//     that map before any divert is resolved.
//
// Compared to the previous synthetic-knot+stitch approach:
//   - No upval scanning. The body sees outer scope naturally.
//   - No by-reference argument shoveling.
//   - No `ctx.hoistedKnots` push — the gather lives at its source
//     position.
//
// V1 limitations (unchanged from before):
//   - No `break` / `continue`. Adding `break` is straightforward in
//     this shape: append a second labeled gather after the loop and
//     divert to it from the break-site. `continue` is a divert to
//     the loop gather (same as the tail jump).
//   - No numeric `for i = 1, 10`. Same gather-and-conditional pattern
//     works; the lowerer just emits the init / step / bound checks.
//   - No generic `for k, v in pairs(t)`. Needs the iterator protocol.

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
  // Grammar shape:
  //   LuauWhileLoop > LuauWhileLoop_content > [ LuauWhileCondition, LuauDoBlock ]
  // The body lives inside LuauDoBlock > LuauDoBlock_content.
  const condNode = getDescendent("LuauWhileCondition", nodeRef.node);
  const doBlock = getDescendent("LuauDoBlock", nodeRef.node);
  const bodyContent = doBlock
    ? findChildByName(doBlock, "LuauDoBlock_content")
    : null;
  if (!condNode || !bodyContent) return {};

  // The gather's name must be unique across the enclosing flow's
  // named weave points. Tagging with the source offset gives us that
  // without needing a counter on the context.
  const loopLabel = `__while_${nodeRef.node.from}_loop`;
  const breakLabel = `__while_${nodeRef.node.from}_break`;

  const condExpr = lowerExpressionFromContainer(condNode, ctx);

  // Push the loop's break/continue targets so any `break` /
  // `continue` inside the body lowers to a divert to the right label.
  // For `while`, continue = the loop gather itself (re-evaluates
  // cond), break = the post-loop gather.
  ctx.loopStack?.push({ continueLabel: loopLabel, breakLabel });
  const bodyStatements = lowerStatements(bodyContent, ctx, WHILE_BODY_SKIP);
  ctx.loopStack?.pop();

  const tailDivert = new Divert([new Identifier(loopLabel)]);
  const branch = new ConditionalSingleBranch([
    ...bodyStatements,
    tailDivert,
  ]);
  // Normalize to a boolean under LUA truthiness (only nil/false are
  // falsy — `while 0 do` / `while "" do` must loop). Same TRUTHY
  // wrapping as if/elseif conditions in lowerSparkdownIfBlock.
  if (condExpr) {
    branch.ownExpression = new UnaryExpression(
      condExpr,
      NativeFunctionCall.LuauTruthy,
    );
  }
  branch.isElse = false;
  const conditional = new Conditional(null as never, [branch]);

  // indentationDepth = 1 keeps this gather at the same level as the
  // surrounding weave's other content. `ConstructWeaveHierarchyFrom-
  // Indentation` only nests a weave point when its indent index is
  // strictly greater than the parent weave's base index, and the
  // base index defaults to 0 (or the depth of the first weave point
  // - 1 when other gathers exist). Depth 1 sits at base level 0 in
  // both cases.
  const gather = new Gather(new Identifier(loopLabel), 1);
  gather.AddContent(conditional);

  // Sentinel gather past the loop body. `break` diverts here; control
  // also falls through to it naturally when the condition is false.
  // No content — execution flows through and past it back to the
  // enclosing weave.
  const breakGather = new Gather(new Identifier(breakLabel), 1);

  return { content: [gather, breakGather] };
}
