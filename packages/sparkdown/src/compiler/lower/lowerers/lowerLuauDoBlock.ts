import { nodeNameSet } from "../../utils/nodeNameSet";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { AstStatBlock } from "../../typecheck/Ast";
import type { LowerContext } from "../context";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";
import { bodyOfBlock, openBody } from "../utils/statementShape";
import { statementNodeAt, type StatementSite } from "./lowerLuauStatement";

// `do BODY end` — a standalone block-scoping construct (no loop
// semantics). Body runs once. The `BeginScope` / `EndScope` wrap
// makes `local x` inside the body shadow any outer `x` for the
// duration of the block, then restores the outer binding on exit.
// This matches Lua's `do ... end` scoping rule.
//
// Grammar shape:
//   LuauDoBlock > LuauDoBlock_content > [body statements]
// (`LuauSparkdownDoBlock` in a scene or at the top level, same shape).
//
// `while` and `for` use a do-block internally for their body region,
// but those constructs handle the do-block themselves via
// `findLoopDoBlock` and never dispatch through this lowerer. This handler is reached only when `do ... end` appears as
// a STATEMENT in its own right.

const DO_BLOCK_SKIP: ReadonlySet<string> = nodeNameSet([
  "LuauDoKeyword",
  "LuauEndKeyword",
  "LuauComment",
]);

const DO_NODES = nodeNameSet(["LuauDoBlock", "LuauSparkdownDoBlock", "LuauSparkdownExplicitDoBlock"]);

export function lowerLuauDoBlock(
  stat: AstStatBlock,
  site: StatementSite,
  ctx: LowerContext,
): CompiledBlock {
  const node = statementNodeAt(stat, site, DO_NODES, ctx);
  if (!node) return {};
  const bodyContent = findChildByName(node, `${node.name}_content`);
  if (!bodyContent) return {};
  const shape = openBody(ctx, bodyContent.from, bodyContent.to);
  // Bump `ctx.scopeDepth` around the body lowering so a `break` /
  // `continue` inside the block knows to emit an EndScope for this
  // frame before diverting out of the enclosing loop.
  ctx.scopeDepth = (ctx.scopeDepth ?? 0) + 1;
  const body = lowerStatements(bodyContent, ctx, DO_BLOCK_SKIP, shape);
  ctx.scopeDepth--;
  const scoped = wrapInScope(body);
  if (shape) {
    bodyOfBlock.set(scoped[0]!, shape);
  }
  return wrapInWeave(scoped);
}
