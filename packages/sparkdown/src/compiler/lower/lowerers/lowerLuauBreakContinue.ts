import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

// `break` and `continue` — exit / restart the innermost enclosing
// loop. Both lower to a single `Divert` to the appropriate label,
// which each loop lowerer has set up:
//   - `break` diverts to the loop's `breakLabel` (a gather sitting
//     just past the loop body; falling through it leaves the loop
//     and runs any required scope cleanup naturally).
//   - `continue` diverts to the loop's `continueLabel` (the gather
//     where each iteration's "after the body" logic lives — the
//     while-loop's top, the for-loop's step-update label, the
//     repeat-loop's until-check label).
//
// The label names are stored on `ctx.loopStack`, which each loop
// pushes/pops around its body lowering. If `break` or `continue`
// appears outside any loop, we emit nothing (the lowerer silently
// drops it — the compiler reports the unbalanced keyword via the
// grammar / no-resolved-target path elsewhere).

export function lowerLuauBreakStatement(
  _nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const top = ctx.loopStack?.[ctx.loopStack.length - 1];
  if (!top) return {};
  return wrapInWeave([new Divert([new Identifier(top.breakLabel)])]);
}

export function lowerLuauContinueStatement(
  _nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const top = ctx.loopStack?.[ctx.loopStack.length - 1];
  if (!top) return {};
  return wrapInWeave([new Divert([new Identifier(top.continueLabel)])]);
}
