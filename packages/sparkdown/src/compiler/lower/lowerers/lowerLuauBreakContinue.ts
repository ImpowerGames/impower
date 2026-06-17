import { ControlCommand as RuntimeControlCommand } from "../../../inkjs/engine/ControlCommand";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Wrap } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Wrap";
import { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";

// `break` and `continue` — exit / restart the innermost enclosing
// loop. Both lower to a `Divert` to the appropriate label, which each
// loop lowerer has set up:
//   - `break` diverts to the loop's `breakLabel` (a gather sitting
//     just past the loop body; falling through it leaves the loop
//     and runs the loop's own `EndScope` naturally).
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
//
// Scope unwinding: a `break`/`continue` nested inside scoped blocks
// (`if` arms, `do` bodies) diverts PAST those blocks' EndScope
// commands. Skipping them leaks scope frames on the call-stack
// element, which desyncs later PopScope pairing — and with Lua
// upvalue closing, a leaked frame makes a later same-named `local`
// redeclaration close a still-open upvalue against the WRONG binding
// (basic.luau's break-inside-if timely-closing test summed 11, not
// 15). The loop records `ctx.scopeDepth` at its body level; we emit
// one `EndScope` per level the divert would skip.

function scopeUnwind(ctx: LowerContext, targetDepth: number): ParsedObject[] {
  const current = ctx.scopeDepth ?? 0;
  const count = Math.max(0, current - targetDepth);
  const out: ParsedObject[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Wrap(RuntimeControlCommand.EndScope()));
  }
  return out;
}

export function lowerLuauBreakStatement(
  _nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const top = ctx.loopStack?.[ctx.loopStack.length - 1];
  if (!top) return {};
  return wrapInWeave([
    ...scopeUnwind(ctx, top.scopeDepth ?? 0),
    new Divert([new Identifier(top.breakLabel)]),
  ]);
}

export function lowerLuauContinueStatement(
  _nodeRef: SparkdownSyntaxNodeRef,
  ctx: LowerContext,
): CompiledBlock {
  const top = ctx.loopStack?.[ctx.loopStack.length - 1];
  if (!top) return {};
  return wrapInWeave([
    ...scopeUnwind(ctx, top.scopeDepth ?? 0),
    new Divert([new Identifier(top.continueLabel)]),
  ]);
}
