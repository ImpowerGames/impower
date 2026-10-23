// What a name refers to while a function's statements lower: a local of an
// enclosing function, a name an assignment in one rebinds to a value
// (`recordRebind`), or neither (a global, a knot or a stdlib name). The
// lowerers ask by name, innermost scope first, and record each answer that
// decides a statement's code for the binary program's chunk store.

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

// Wrap the lowerer's `new FunctionCall(name, args)` site so that
// bare (unnamespaced) source names registered in `STDLIB`
// (StdLib.ts) get arg-normalized (e.g. `assert(cond)` is padded
// with a default message) before construction. The source name is
// preserved verbatim — the registry uses the lowercase Luau-style
// name as both lookup key and runtime identifier. Adding a new
// state-aware builtin is one entry in `STDLIB`; if it needs
// arg-normalization (defaulting, padding) the special case lives
// here. `range` is the call's source, for the deprecation hint; a
// synthetic call site passes none.
export function makeGlobalFunctionCall(
  name: Identifier,
  args: Expression[],
  range?: { from: number; to: number },
  ctx?: LowerContext,
): FunctionCall {
  const resolved = lookupGlobalStdLibBuiltin(name.name, args.length);
  if (!resolved) return new FunctionCall(name, args);
  // Editor-side strikethrough for deprecated stdlib calls (e.g.
  // `unpack(t)`). Runtime still dispatches normally; the diagnostic
  // is purely a hint.
  if (range && ctx) {
    validateStdLibDeprecation(resolved, range, ctx);
  }
  return new FunctionCall(new Identifier(resolved), args);
}

// Resolve a bare callable name against the lexical scope chain,
// innermost frame first. Every function-lowering site pushes one
// frame onto BOTH `declaredLocalsStack` and
// `siblingSubFlowNamesStack` in tandem (see
// lowerLuauFunctionDefinition / lowerFunctionExpression), so frames
// align by index. A name a frame's assignment rebinds, or a local of a
// frame, answers "local": the call dispatches through the variable.
// A frame's locals are every name its function's body declares, in any
// block.
export function resolveCallableBinding(
  name: string,
  ctx: LowerContext,
): "local" | null {
  const locals = ctx.declaredLocalsStack ?? [];
  const siblings = ctx.siblingSubFlowNamesStack ?? [];
  const depth = Math.max(locals.length, siblings.length);
  for (let i = depth - 1; i >= 0; i--) {
    if (siblings[i]?.get(name) !== undefined) {
      // Rebound names (`f = <expr>` over a bare global) dispatch as VALUE
      // calls, not static diverts.
      recordSiblingRead(ctx, `call:${name}=local`);
      return "local";
    }
    if (locals[i]?.has(name)) return "local";
  }
  return null;
}

/**
 * Whether a local in scope where `name` is written, at `at`, hides the
 * standard library's `name` (a function such as `type`, or a namespace such
 * as `math`) from a call, as Luau scopes it (I-1372): a local of a function
 * lowering around it, in scope there, or else the `local` of the root frame's
 * own scope a read of the name as a value reads there (`rootLocalAnswer`,
 * recorded so the call is lowered again when a `local` above it changes the
 * answer). A function's local of the name that is not in scope at `at`
 * (declared later in its body, or in a block that has ended) hides nothing,
 * as it hides nothing from the value read. Inside a block a top-level
 * statement opens, the root answer names no declaration (`ROOT_IN_BLOCK`)
 * and the call reaches the library, as before the index (I-1468).
 */
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

/**
 * Whether a function lowering around the name declares a local `name`, in
 * any block of its body, as an assignment to the name asks
 * (`lowerReassignment`). The reads here index the context's arrays rather
 * than pass a callback to their methods, which no memo can record.
 */
export function isLocal(name: string, ctx: LowerContext): boolean {
  const locals = ctx.declaredLocalsStack ?? [];
  for (let i = 0; i < locals.length; i++) {
    if (locals[i]!.has(name)) return true;
  }
  return false;
}

// A function's `declaredLocalsStack` frame with where its names are in
// scope (`scopeDeclaredLocals`).
interface ScopedDeclaredLocals extends ReadonlySet<string> {
  scope?: {
    inScope(name: string, at: number): boolean;
  };
}

/**
 * Records where the names of a function's `declaredLocalsStack` frame are
 * in scope: `bindings` are the function's parameters, locals, local
 * functions and loop variables with the ranges they bind over
 * (`functionBindings`), and `bodyWide` the names it declares for the whole
 * body (a `store`). A frame
 * without a record, and a name `bindings` does not hold, is in scope
 * everywhere in the body.
 *
 * The record answers for a name and an offset rather than holding the
 * ranges: the ranges count from the start of the document, and a
 * statement's memo records every value its lowering reads from the context
 * (`recordLowering`), so a statement that read them would be lowered and
 * emitted again by any edit above it. The answer is recorded with the offset
 * it was asked at counted from the statement's start (`takesOffset`).
 */
export function scopeDeclaredLocals(
  frame: ReadonlySet<string>,
  bindings: readonly FunctionBinding[],
  bodyWide: ReadonlySet<string>,
): void {
  (frame as ScopedDeclaredLocals).scope = {
    inScope: takesOffset((name: string, at: number): boolean => {
      if (bodyWide.has(name)) return true;
      // A name the bindings do not hold keeps the frame's answer.
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

/**
 * Whether the local `name` of a `declaredLocalsStack` frame is in scope at
 * the offset `at`: always with no offset, no record of the frame's scope
 * (`scopeDeclaredLocals`), or a name declared for the whole body. With no
 * offset, nothing of the frame's scope is read.
 */
export function localInScope(
  frame: ReadonlySet<string>,
  name: string,
  at: number | undefined,
): boolean {
  if (at === undefined) return true;
  const scope = (frame as ScopedDeclaredLocals).scope;
  return !scope || scope.inScope(name, at);
}

/**
 * Records in the running statement's reads what its lowering found a name
 * to be among the rebound names: that a call of it dispatches through the
 * variable (`resolveCallableBinding`). An assignment of the name that an
 * edit adds or removes changes the answer and the statement's code, not its
 * syntax, and the binary program's chunk store emits a statement again when
 * its reads change. Whether a closure captures the name is in the list of
 * names it captures (`recordCaptureRead`).
 */
export function recordSiblingRead(ctx: LowerContext, read: string): void {
  const reads = currentStatement(ctx)?.reads.other;
  if (reads && !reads.some((existing) => existing === read)) {
    reads.push(read);
  }
}

/**
 * Records in the running statement's reads the names a function it writes
 * captures, in order: the statement's code passes them to the function and
 * the function's entry binds them, and the function's body, whose lines are
 * not the statement's syntax, decides them, so the binary program's chunk
 * store emits the statement again when an edit inside the body changes them
 * (`ChunkStore.take`). Each lowering that builds a function records the list
 * it builds the function from, not the scan's (`freeVariables`): a
 * method's without its implicit `self`, and a `local function`'s that calls
 * itself with its own name added. Each function is recorded in the order the
 * lowering builds it, since two functions of one statement can capture the
 * same names.
 */
export function recordCaptureRead(
  ctx: LowerContext,
  names: readonly string[],
): void {
  currentStatement(ctx)?.reads.other.push(`captures:${names.join(",")}`);
}

/**
 * Records that an assignment rebinds `name` to a runtime value (`name =
 * <expr>`, and a function statement, Lua's sugar for it, I-1422). For a name
 * that is not a local of a function lowering around it (a global, a
 * builtin), the registry, consulted in lexical order, drops any earlier
 * entry and marks the name `rebound`, so a later call value-dispatches
 * through the variable (`CallValueExpression` carries the call-site arg
 * count the runtime needs to pack `...` args) while still suppressing upval
 * capture: a closure referencing a bare-assigned global (`self = 20` then
 * `function a.y (x) return x+self end`, calls.luau line 34) reads the
 * global, it doesn't capture a pointer. A local's calls value-dispatch
 * already, and registering it here would wrongly suppress its capture.
 */
export function recordRebind(name: string, ctx: LowerContext): void {
  if (isLocal(name, ctx) || !ctx.siblingSubFlowNamesStack) return;
  for (const frame of ctx.siblingSubFlowNamesStack) {
    frame.delete(name);
  }
  ctx.siblingSubFlowNamesStack.at(-1)?.set(name, { rebound: true });
}
