import { nodeNameSet } from "../../utils/nodeNameSet";
import { Conditional } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/Conditional";
import { ConditionalSingleBranch } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Conditional/ConditionalSingleBranch";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Gather } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Gather/Gather";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { UnaryExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/UnaryExpression";
import { NativeFunctionCall } from "../../../inkjs/engine/NativeFunctionCall";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatWhile } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { lowerExpression } from "../expression/lowerExpression";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { syntheticId } from "../utils/documentTag";
import { findLoopDoBlock } from "../utils/loopDoBlock";
import { openBody, recordLoop } from "../utils/statementShape";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { statementNodeAt, type StatementSite } from "./lowerLuauStatement";

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
//       BeginScope
//       BODY
//       EndScope
//       -> __while_<offset>_loop
//     }
//
// `<offset>` is `syntheticId`: the document tag, `$`, then the loop's offset
// in the document. The rename pass recognizes these names by that `$`.
//
// Why this works:
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
//   - The gather lives at its source position, so the body sees the
//     enclosing scope directly and needs no hoisted container.
//
// `break` diverts to a second labeled gather after the loop, and
// `continue` diverts to the loop gather, the same as the tail jump.

const WHILE_BODY_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauWhileCondition",
  "LuauWhileKeyword",
  "LuauDoKeyword",
  "LuauComment",
]);

const WHILE_NODES = nodeNameSet(["LuauWhileLoop", "LuauSparkdownWhileLoop", "LuauSparkdownExplicitLoop"]);

export function lowerLuauWhileLoop(
  stat: AstStatWhile,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, WHILE_NODES, ctx);
  if (!node) return {};
  // The condition is the AST's. The body lives inside the loop node's
  // LuauDoBlock > LuauDoBlock_content. A loop in a scene or at the top level
  // parses as `LuauSparkdownWhileLoop` holding a `LuauSparkdownDoBlock`, in
  // the same shape. An EMPTY body
  // (`while tick() do end`) has no `_content` child; the loop must still
  // lower, since its condition runs on every iteration.
  // `lowerStatements(null)` yields [].
  const doBlock = findLoopDoBlock(node, ctx);
  const bodyContent = doBlock
    ? findChildByName(doBlock, `${doBlock.name}_content`)
    : null;
  if (!doBlock) return {};

  // The gather's name must be unique across the enclosing flow's
  // named weave points. Tagging with the document and the source offset
  // within it (`syntheticId`) gives us that without needing a counter on
  // the context.
  const id = syntheticId(node.from, ctx);
  const loopLabel = `__while_${id}_loop`;
  const breakLabel = `__while_${id}_break`;

  const condExpr = lowerExpression(stat.condition, site.source, ctx);

  // Push the loop's break/continue targets so any `break` /
  // `continue` inside the body lowers to a divert to the right label.
  // For `while`, continue = the loop gather itself (re-evaluates
  // cond), break = the post-loop gather. The body is a block: each
  // iteration opens its own scope inside the branch and closes it
  // before the tail jump, so a body `local` ends with the iteration
  // and shadows an outer local instead of replacing it. The body is
  // lowered one level deeper, while the loop records the outer depth,
  // so `break`/`continue` also close the body's scope before diverting.
  const outerScopeDepth = ctx.scopeDepth ?? 0;
  ctx.loopStack?.push({
    continueLabel: loopLabel,
    breakLabel,
    scopeDepth: outerScopeDepth,
  });
  const body = openBody(
    ctx,
    bodyContent?.from ?? doBlock.from,
    bodyContent?.to ?? doBlock.to,
  );
  ctx.scopeDepth = outerScopeDepth + 1;
  const bodyStatements = lowerStatements(
    bodyContent,
    ctx,
    WHILE_BODY_SKIP,
    body,
  );
  ctx.scopeDepth = outerScopeDepth;
  ctx.loopStack?.pop();

  const tailDivert = new Divert([new Identifier(loopLabel)]);
  const branch = new ConditionalSingleBranch([
    ...wrapInScope(bodyStatements),
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

  if (body) {
    recordLoop(gather, {
      kind: "while",
      body,
      objects: [gather, breakGather],
      test: branch,
      init: [],
    });
  }

  // A chunk's content reaches the enclosing scene or top-level flow only
  // as a Weave; inside a body, `lowerStatements` unwraps it again.
  return wrapInWeave([gather, breakGather]);
}
