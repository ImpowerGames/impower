// What a name refers to while a function's statements lower: a local of an
// enclosing function, a variadic function nested in one (a "sibling
// subflow", which is no variable and is reached by path), or neither (a
// global, a knot or a stdlib name). The lowerers ask by name, innermost scope
// first, and record each answer that decides a statement's code for the
// binary program's chunk store.

import { Expression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/Expression";
import { VariablePointerExpression } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Expression/VariablePointerExpression";
import { FunctionCall } from "../../../inkjs/compiler/Parser/ParsedHierarchy/FunctionCall";
import { Identifier } from "../../../inkjs/compiler/Parser/ParsedHierarchy/Identifier";
import { lookupGlobalStdLibBuiltin } from "../../../runtime/StdLib";
import type { LowerContext, SiblingSubFlowInfo } from "../context";
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
// align by index. Within one frame a variadic sibling subflow wins
// over a same-named local; ACROSS frames the inner binding wins
// regardless of kind — a lambda param `f` shadows an outer variadic
// `function f(...)` (vararg.luau's `call = function (f, args)`), and
// an inner variadic `function foo(...)` shadows an outer
// `local function foo` (basic.luau line 342). A flat
// "sibling-check-first" rule gets one of those two wrong whichever
// way it's ordered.
//
// A frame's locals are every name its function's body declares, in any
// block; `at`, the offset the name is written at, keeps a local whose
// block has ended, or that is declared after `at`, from answering, so
// the name reaches a sibling of an enclosing function as Luau scopes it
// (`localInScope`).
export function resolveCallableBinding(
  name: string,
  ctx: LowerContext,
  at?: number,
): "sibling" | "local" | null {
  const locals = ctx.declaredLocalsStack ?? [];
  const siblings = ctx.siblingSubFlowNamesStack ?? [];
  const depth = Math.max(locals.length, siblings.length);
  const scopeAt = siblingRegistered(name, ctx) ? at : undefined;
  for (let i = depth - 1; i >= 0; i--) {
    const sibling = siblings[i]?.get(name);
    if (sibling !== undefined) {
      // Rebound names (`f = <expr>` over a former subflow or a bare
      // global) dispatch as VALUE calls, not static diverts.
      const binding = sibling.rebound ? "local" : "sibling";
      recordSiblingRead(ctx, `call:${name}=${binding}`);
      return binding;
    }
    const frame = locals[i];
    if (frame?.has(name) && localInScope(frame, name, scopeAt)) return "local";
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
 * Whether a local of a function lowering around `at` binds `name` there, as
 * an assignment to the name asks (`lowerReassignment`): a local whose block
 * has ended, or that is declared after `at`, does not, when a sibling of the
 * name is registered for it to hide (`localInScope`).
 */
export function isLocalAt(name: string, ctx: LowerContext, at: number): boolean {
  const scopeAt = siblingRegistered(name, ctx) ? at : undefined;
  const locals = ctx.declaredLocalsStack ?? [];
  for (let i = 0; i < locals.length; i++) {
    if (locals[i]!.has(name) && localInScope(locals[i]!, name, scopeAt)) {
      return true;
    }
  }
  return false;
}

/**
 * Whether a variadic sibling subflow of `name`, not rebound, is registered
 * in any function lowering around the name: only then does where a local's
 * block ends decide what the name refers to. The scope is asked only then,
 * since a statement's memo records every answer its lowering reads from the
 * context (`recordLowering`), and a name with nothing to hide needs none.
 * The reads here index the context's arrays rather than pass a callback to
 * their methods, which no memo can record.
 */
export function siblingRegistered(name: string, ctx: LowerContext): boolean {
  const siblings = ctx.siblingSubFlowNamesStack ?? [];
  for (let i = 0; i < siblings.length; i++) {
    const entry = siblings[i]!.get(name);
    if (entry !== undefined && !entry.rebound) return true;
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
 * to be among the sibling subflows: whether a call reaches the subflow or a
 * value (`resolveCallableBinding`), and the pointers a call to a subflow or
 * a reference to one as a value passes. A `local` of the name that an edit
 * adds or removes changes the answer (`shadowSiblingSubFlow`) and the
 * statement's code, not its syntax, and the binary program's chunk store
 * emits a statement again when its reads change. Whether a closure captures
 * the name is in the list of names it captures (`recordCaptureRead`).
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
 * Hides the sibling subflow `name` of the innermost function for the rest of
 * the block being lowered, as a `local` of that name declared in the block,
 * or a loop's variable of that name, hides it in Luau: calls and references
 * to the name after the declaration dispatch to the local's value, as a
 * rebound name's do (`resolveCallableBinding`), and the subflow is visible
 * again when the block ends (`lowerStatements`, or the loop that pushed a
 * block of its own for its variables). Without it, a call to the local would
 * pass the subflow's upvalues before its own arguments.
 */
export function shadowSiblingSubFlow(name: string, ctx: LowerContext): void {
  const frame = ctx.siblingSubFlowNamesStack?.at(-1);
  const hidden = frame?.get(name);
  const ends = ctx.blockEndStack?.at(-1);
  if (!frame || !hidden || hidden.rebound || !ends) {
    return;
  }
  const shadow: SiblingSubFlowInfo = { ...hidden, rebound: true };
  frame.set(name, shadow);
  ends.push(() => {
    // A redefinition of the subflow later in the block replaced the shadow.
    if (frame.get(name) === shadow) {
      frame.set(name, hidden);
    }
  });
}

/**
 * Records that an assignment written at `at` rebinds `name` to a runtime
 * value (`name = <expr>`, and a function statement, Lua's sugar for it,
 * I-1422). For a name that is not a local in scope there (a global, a
 * builtin, a former sibling subflow), the sibling registry, consulted in
 * lexical order, drops any stale subflow entry, so a later `name(...)` does
 * not statically divert to an old knot, and marks the name `rebound`, so a
 * later call value-dispatches through the variable (`CallValueExpression`
 * carries the call-site arg count the runtime needs to pack `...` args)
 * while still suppressing upval capture: a closure referencing a
 * bare-assigned global (`self = 20` then `function a.y (x) return x+self
 * end`, calls.luau line 34) reads the global, it doesn't capture a pointer.
 * A local's calls value-dispatch already, and registering it here would
 * wrongly suppress its capture. A local whose block has ended is no local
 * here (`isLocalAt`).
 */
export function recordRebind(name: string, at: number, ctx: LowerContext): void {
  if (isLocalAt(name, ctx, at) || !ctx.siblingSubFlowNamesStack) return;
  for (const frame of ctx.siblingSubFlowNamesStack) {
    frame.delete(name);
  }
  ctx.siblingSubFlowNamesStack.at(-1)?.set(name, {
    upvals: [],
    arity: -1,
    knotName: name,
    rebound: true,
  });
}

// The registry entry of a sibling variadic SubFlow (captured upval
// names + declared fixed arity), or null when `name` isn't a
// registered subflow. Call sites prepend one
// `VariablePointerExpression` per upval (mirroring the closure-upval
// mechanism) so the subflow's prepended upval PARAMETERS receive the
// enclosing scope's cells — reads and writes go through the shared
// cell, and self-recursive calls thread the subflow's own upval
// params down each level.
export function siblingSubFlowInfo(
  name: string,
  ctx: LowerContext,
): SiblingSubFlowInfo | null {
  const stack = ctx.siblingSubFlowNamesStack;
  if (!stack) return null;
  for (let i = stack.length - 1; i >= 0; i--) {
    const hit = stack[i]!.get(name);
    if (hit !== undefined) return hit;
  }
  return null;
}

// Prepend a sibling subflow's upval pointers to a call's arg list.
// No-op (returns `args` unchanged) when `name` isn't a registered
// sibling subflow or captures nothing. The subflow's body decides the
// pointers, so the calling statement records them (`recordSiblingRead`).
export function withSiblingSubFlowUpvalArgs(
  name: string,
  args: Expression[],
  ctx: LowerContext,
): Expression[] {
  const upvals = siblingSubFlowInfo(name, ctx)?.upvals ?? null;
  if (upvals) recordSiblingRead(ctx, `upvals:${name}=${upvals.join(",")}`);
  if (!upvals || upvals.length === 0) return args;
  return [
    ...upvals.map((n) => new VariablePointerExpression(n)),
    ...args,
  ];
}
