import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { lowerStatements } from "../lower";
import { findChildByName } from "../utils/alternatorArms";
import { wrapInScope } from "../utils/wrapInScope";
import { wrapInWeave } from "../utils/wrapInWeave";

// `do BODY end` — a standalone block-scoping construct (no loop
// semantics). Body runs once. The `BeginScope` / `EndScope` wrap
// makes `local x` inside the body shadow any outer `x` for the
// duration of the block, then restores the outer binding on exit.
// This matches Lua's `do ... end` scoping rule.
//
// Grammar shape:
//   LuauDoBlock > LuauDoBlock_content > [body statements]
//
// `while` and `for` use `LuauDoBlock` internally for their body
// region, but those constructs handle the do-block themselves via
// `getDescendent("LuauDoBlock", ...)` and never dispatch through this
// lowerer. This handler is reached only when `do ... end` appears as
// a STATEMENT in its own right.

const DO_BLOCK_SKIP: ReadonlySet<string> = new Set([
  "LuauDoKeyword",
  "LuauEndKeyword",
  "LuauComment",
]);

export function lowerLuauDoBlock(
  nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const bodyContent = findChildByName(nodeRef.node, "LuauDoBlock_content");
  if (!bodyContent) return {};
  const body = lowerStatements(bodyContent, ctx, DO_BLOCK_SKIP);
  return wrapInWeave(wrapInScope(body));
}
