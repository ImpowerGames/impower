import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { lookupGlobalStdLibBuiltin } from "../../../runtime/StdLib";
import type { LowerContext } from "../context";
import { takesOffset } from "../recordingContext";
import type { FunctionBinding } from "../utils/functionBindings";
import { answersDeclaration, rootLocalAnswer } from "../utils/rootLocalReads";
import { currentStatement } from "../utils/statementShape";
import { validateStdLibDeprecation } from "../utils/validateStdLibDeprecation";

export function makeGlobalFunctionCall(
  name: Identifier,
  args: Expression[],
  range?: { from: number; to: number },
  ctx?: LowerContext,
): FunctionCall {
  const resolved = lookupGlobalStdLibBuiltin(name.name, args.length);
  if (!resolved) return new FunctionCall(name, args);
  if (range && ctx) {
    validateStdLibDeprecation(resolved, range, ctx);
  }
  return new FunctionCall(new Identifier(resolved), args);
}

export function resolveCallableBinding(
  name: string,
  ctx: LowerContext,
): "local" | null {
  const locals = ctx.declaredLocalsStack ?? [];
  const siblings = ctx.siblingSubFlowNamesStack ?? [];
  const depth = Math.max(locals.length, siblings.length);
  for (let i = depth - 1; i >= 0; i--) {
    if (siblings[i]?.get(name) !== undefined) {
      recordSiblingRead(ctx, `call:${name}=local`);
      return "local";
    }
    if (locals[i]?.has(name)) return "local";
  }
  return null;
}

export function localHidesStdLib(
  name: string,
  ctx: LowerContext,
  at: number,
): boolean {
  const locals = ctx.declaredLocalsStack ?? [];
  for (let i = locals.length - 1; i >= 0; i--) {
    const frame = locals[i]!;
    if (frame.has(name) && localInScope(frame, name, at)) return true;
  }
  return answersDeclaration(rootLocalAnswer(name, at, ctx));
}

export function isLocal(name: string, ctx: LowerContext): boolean {
  const locals = ctx.declaredLocalsStack ?? [];
  for (let i = 0; i < locals.length; i++) {
    if (locals[i]!.has(name)) return true;
  }
  return false;
}

interface ScopedDeclaredLocals extends ReadonlySet<string> {
  scope?: {
    inScope(name: string, at: number): boolean;
  };
}

export function scopeDeclaredLocals(
  frame: ReadonlySet<string>,
  bindings: readonly FunctionBinding[],
  bodyWide: ReadonlySet<string>,
): void {
  (frame as ScopedDeclaredLocals).scope = {
    inScope: takesOffset((name: string, at: number): boolean => {
      if (bodyWide.has(name)) return true;
      let bound = false;
      for (const b of bindings) {
        if (b.name !== name) continue;
        if (b.from <= at && at >= b.blockFrom && at <= b.blockTo) return true;
        bound = true;
      }
      return !bound;
    }),
  };
}

export function localInScope(
  frame: ReadonlySet<string>,
  name: string,
  at: number | undefined,
): boolean {
  if (at === undefined) return true;
  const scope = (frame as ScopedDeclaredLocals).scope;
  return !scope || scope.inScope(name, at);
}

export function recordSiblingRead(ctx: LowerContext, read: string): void {
  const reads = currentStatement(ctx)?.reads.other;
  if (reads && !reads.some((existing) => existing === read)) {
    reads.push(read);
  }
}

export function recordCaptureRead(
  ctx: LowerContext,
  names: readonly string[],
): void {
  currentStatement(ctx)?.reads.other.push(`captures:${names.join(",")}`);
}

export function recordRebind(name: string, ctx: LowerContext): void {
  if (isLocal(name, ctx) || !ctx.siblingSubFlowNamesStack) return;
  for (const frame of ctx.siblingSubFlowNamesStack) {
    frame.delete(name);
  }
  ctx.siblingSubFlowNamesStack.at(-1)?.set(name, { rebound: true });
}
