import { ControlCommand as RuntimeControlCommand } from "../../../runtime/ControlCommand";
import { Divert } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Divert/Divert";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { ParsedObject } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Object";
import { Wrap } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Wrap";
import type { CompiledBlock } from "../../classes/annotators/CompilationAnnotator";
import type { LowerContext } from "../context";
import { wrapInWeave } from "../utils/wrapInWeave";
import {
  loopExitOf,
  loopExitUnwind,
  recordLoopDepth,
} from "../utils/statementShape";

function scopeUnwind(ctx: LowerContext, targetDepth: number): ParsedObject[] {
  const current = ctx.scopeDepth ?? 0;
  const count = Math.max(0, current - targetDepth);
  recordLoopDepth(ctx, count);
  const out: ParsedObject[] = [];
  for (let i = 0; i < count; i++) {
    out.push(new Wrap(RuntimeControlCommand.EndScope()));
  }
  return out;
}

export function lowerLuauBreakStatement(ctx: LowerContext): CompiledBlock {
  const top = ctx.loopStack?.[ctx.loopStack.length - 1];
  if (!top) return {};
  const divert = new Divert([new Identifier(top.breakLabel)]);
  loopExitOf.set(divert, "break");
  const unwind = scopeUnwind(ctx, top.scopeDepth ?? 0);
  loopExitUnwind.set(divert, unwind.length);
  return wrapInWeave([...unwind, divert]);
}

export function lowerLuauContinueStatement(ctx: LowerContext): CompiledBlock {
  const top = ctx.loopStack?.[ctx.loopStack.length - 1];
  if (!top) return {};
  const divert = new Divert([new Identifier(top.continueLabel)]);
  loopExitOf.set(divert, "continue");
  const unwind = scopeUnwind(ctx, top.scopeDepth ?? 0);
  loopExitUnwind.set(divert, unwind.length);
  return wrapInWeave([...unwind, divert]);
}
