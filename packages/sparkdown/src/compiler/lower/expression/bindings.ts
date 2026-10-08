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
export function resolveCallableBinding(
  name: string,
  ctx: LowerContext,
): "sibling" | "local" | null {
  const locals = ctx.declaredLocalsStack ?? [];
  const siblings = ctx.siblingSubFlowNamesStack ?? [];
  const depth = Math.max(locals.length, siblings.length);
  for (let i = depth - 1; i >= 0; i--) {
    const sibling = siblings[i]?.get(name);
    if (sibling !== undefined) {
      // Rebound names (`f = <expr>` over a former subflow or a bare
      // global) dispatch as VALUE calls, not static diverts.
      const binding = sibling.rebound ? "local" : "sibling";
      recordSiblingRead(ctx, `call:${name}=${binding}`);
      return binding;
    }
    if (locals[i]?.has(name)) return "local";
  }
  return null;
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
