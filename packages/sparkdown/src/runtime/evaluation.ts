// The evaluation helpers both story engines call: function calls and their
// arguments, indexing and metamethods, tuples, string and tag capture, the
// standard library's results, and the shuffle index. They take the story
// they run on duck-typed, as `StdLib` does. Moved here from `Story.ts` (#705).
import { InkObject } from "./Object";
import type { CallStack } from "./CallStack";
import { ControlCommand } from "../inkjs/engine/ControlCommand";
import {
  Value,
  StringValue,
  IntValue,
  FloatValue,
  BoolValue,
  DivertTargetValue,
  VariablePointerValue,
  ObjectValue,
  AbstractValue,
  MultiValue,
  NullValue,
  SymbolValue,
} from "./Value";
import { Path } from "./Path";
import { Void } from "./Void";
import { oneValue, spreadCallArgs } from "./CallArgs";
import { Tag } from "./Tag";
import { NativeFunctionCall } from "./NativeFunctionCall";
import {
  BUILTIN_ITER_TAG,
  GLOBALS_PROXY_TAG,
  isPureNumberStdLibOp,
  isStdLibFunctionName,
  isStdLibNamespaceName,
  luauTypeOf,
  lookupAnyStdLib,
  stepBuiltinIterator,
  unwrapArgsForPureStdLibFn,
  type StdLibEntry,
} from "./StdLib";
import { callBuiltinMethod, METHOD_PREFIX } from "./MethodDispatch";
import { drawStoryRandom } from "./StoryRandom";
import { StoryException } from "./StoryException";
import { isLuauTruthy } from "./LuauTruthiness";
import { PRNG } from "./PRNG";
import { StringBuilder } from "./StringBuilder";
import { asOrNull } from "./TypeAssertion";


if (!Number.isInteger) {
  Number.isInteger = function isInteger(nVal: any) {
    return (
      typeof nVal === "number" &&
      isFinite(nVal) &&
      nVal > -9007199254740992 &&
      nVal < 9007199254740992 &&
      Math.floor(nVal) === nVal
    );
  };
}

/**
 * A function a call enters, as the call handlers the two engines share read
 * it: the container of a path on the current engine, and the entry of a
 * symbol on the binary program's (`ProgramStory`). A story that runs the
 * shared handlers gives the function a function value names
 * (`FunctionTargetOf`), and enters one in a new function frame
 * (`EnterFunction`).
 */
export interface FunctionTarget {
  /** Whether the function binds a `...` slot after its fixed parameters. */
  readonly variadic: boolean;
  /** How many values the function's entry binds, its `...` slot
   *  included. */
  readonly bindings: number;
}

/** The function a container of the current engine's tree is. */
export class ContainerTarget implements FunctionTarget {
  constructor(
    readonly container: any,
    readonly path: Path | null = null,
  ) {}
  get variadic(): boolean {
    return containerBindings(this.container).variadic;
  }
  get bindings(): number {
    return containerBindings(this.container).bindings;
  }
}

// The parameter bindings of each function container a call has entered. A
// container's content is fixed once generated (a compile that changes the
// function generates a new container), so every call reads them once.
const CONTAINER_BINDINGS = new WeakMap<
  object,
  { variadic: boolean; bindings: number }
>();

function containerBindings(container: any): {
  variadic: boolean;
  bindings: number;
} {
  if (!container) return { variadic: false, bindings: 0 };
  let known = CONTAINER_BINDINGS.get(container);
  if (!known) {
    known = {
      variadic: containerIsVariadic(container),
      bindings: countLeadingParamBindings(container),
    };
    CONTAINER_BINDINGS.set(container, known);
  }
  return known;
}

// If `callTarget` is a closure `ObjectValue` (the shape produced by
// `lowerAnonymousFunction` for closures with captured upvals),
// reorder the eval stack to put upvals before user args and return
// the function its `__closure_fn` names. Returns `null` if `callTarget`
// isn't a closure — caller falls back to plain function-value handling.
export function extractClosureTarget(
  callTarget: any,
  story: any,
): FunctionTarget | null {
  if (!(callTarget instanceof ObjectValue)) return null;
  const map = callTarget.value;
  if (!(map instanceof Map)) return null;
  const fnVal = map.get("__closure_fn");
  const upvalsVal = map.get("__closure_upvals");
  const userArityVal = map.get("__closure_user_arity");
  if (
    !(upvalsVal instanceof ObjectValue) ||
    !(userArityVal instanceof IntValue)
  ) {
    return null;
  }
  const target: FunctionTarget | null = story.FunctionTargetOf(fnVal);
  if (target === null) return null;
  const upvalsMap = upvalsVal.value;
  if (!(upvalsMap instanceof Map)) return null;
  // `__closure_user_arity` counts FIXED params only. A variadic
  // target binds one extra slot — the packed `...` MultiValue the
  // call-site normalization (packVariadicValueCallArgs /
  // normalizeLuauCallArgs) pushed on top of the fixed args — so the
  // upval reorder must lift fixed args AND the pack above the upvals.
  const popCount = (userArityVal.value ?? 0) + (target.variadic ? 1 : 0);
  // Pop K user args (they sit on top of the stack — well, ABOVE the
  // closure value which we already popped).
  const userArgs: AbstractValue[] = [];
  for (let i = 0; i < popCount; i++) {
    userArgs.unshift(story.state.PopEvaluationStack() as AbstractValue);
  }
  // Push upvals in numerical-key order (0, 1, 2, ...).
  let idx = 0;
  while (upvalsMap.has(String(idx))) {
    const v = upvalsMap.get(String(idx));
    if (v) story.state.PushEvaluationStack(v);
    idx++;
  }
  // Re-push user args in original order so the function's parameter
  // binding reads them last.
  for (const a of userArgs) story.state.PushEvaluationStack(a);
  return target;
}

// Lua's index-type rule: only tables (and strings, via their library
// metatable) are indexable. Returns the "attempt to index a X value"
// message for non-indexable values, or `null` when `v` may be indexed.
// Function values include bare DivertTargets, closure-shaped
// ObjectValues, and `__stdlib_fn` markers (`math.pow.a` indexes a
// builtin).
function luauIndexTargetError(v: unknown): string | null {
  if (v == null || v instanceof NullValue || v instanceof Void) {
    return "attempt to index a nil value";
  }
  if (v instanceof BoolValue) return "attempt to index a boolean value";
  if (v instanceof IntValue || v instanceof FloatValue) {
    return "attempt to index a number value";
  }
  if (isFunctionReference(v)) {
    return "attempt to index a function value";
  }
  if (
    v instanceof ObjectValue &&
    ((v.value as Map<string, unknown>)?.has("__closure_fn") ||
      (v.value as Map<string, unknown>)?.has("__stdlib_fn"))
  ) {
    return "attempt to index a function value";
  }
  return null;
}

// Derive the string map-key for a Lua table index. Sparkdown tables
// are string-keyed Maps, so non-string Lua keys must stringify — but
// TABLE keys must use POINTER IDENTITY (Lua semantics): two distinct
// empty tables are distinct keys, a self-referential `a[a] = a` must
// not recurse (ObjectValue.toString serializes contents), and the key
// must stay stable as the table mutates. The WeakMap keys off the
// underlying value Map — the true shared identity across ObjectValue
// wrappers. Stdlib markers (`a[print]`) are the exception: each
// source reference to `print` builds a FRESH marker object, so they
// key by their tag name instead of identity.
const TABLE_IDENTITY_IDS = new WeakMap<object, number>();
let nextTableIdentityId = 1;
function luauMapKeyString(v: any): string {
  if (v instanceof ObjectValue && v.value) {
    const map = v.value as Map<string, AbstractValue>;
    const stdTag = map.get("__stdlib_fn");
    if (stdTag instanceof StringValue) return `__stdlibfn:${stdTag.value}`;
    let id = TABLE_IDENTITY_IDS.get(map);
    if (id === undefined) {
      id = nextTableIdentityId++;
      TABLE_IDENTITY_IDS.set(map, id);
    }
    return `__tableid:${id}`;
  }
  return v?.toString() ?? "";
}

// Look up a metamethod on the metatable of `obj` (e.g. `__index`,
// `__add`, `__call`). Returns the value stored at that key, or `null`
// if the table has no metatable or the metatable lacks that field
// (or stores `nil` at it). Does NOT walk the metatable's own metatable
// — Lua only consults a single level of metatable indirection per
// metamethod lookup.
export function lookupMetamethod(
  obj: any,
  name: string,
): AbstractValue | null {
  if (!(obj instanceof ObjectValue)) return null;
  const mt = obj.metatable;
  if (!(mt instanceof ObjectValue)) return null;
  const v = (mt.value as Map<string, AbstractValue>)?.get(name);
  if (v == null || v instanceof NullValue) return null;
  return v;
}

// Resolve `obj[key]` following Lua's `__index` chain. If `obj` has the
// key directly, return that value. Otherwise consult the metatable's
// `__index`: function form calls `__index(obj, key)`; table form
// recurses into the index table (which may itself have a metatable).
// Cycle-bounded via a depth cap. Returns `null` for a hard miss —
// caller decides the sentinel (sparkdown today pushes `StringValue("")`
// at non-metatable index sites; the new path returns `NullValue` to
// match Lua, but callers may still wrap to keep historical behavior).
function indexThroughMetatable(
  story: any,
  base: any,
  keyStr: string,
  depth: number = 0,
): AbstractValue | null {
  const MAX_DEPTH = 32;
  if (depth > MAX_DEPTH) return null;
  if (!(base instanceof ObjectValue)) return null;
  const direct = base.value?.get(keyStr);
  if (direct != null) return direct as AbstractValue;
  const indexFn = lookupMetamethod(base, "__index");
  if (indexFn == null) return null;
  if (indexFn instanceof ObjectValue) {
    // Treat closure-shaped ObjectValues (`__closure_fn` marker) as
    // function-form even though they're ObjectValues. Otherwise an
    // ObjectValue is a plain table — recurse.
    if (
      (indexFn.value as Map<string, AbstractValue>)?.get("__closure_fn") !=
      null
    ) {
      const results = story.CallLuauFunction(indexFn, [
        base,
        new StringValue(keyStr),
      ]);
      return oneValue((results[0] as AbstractValue) ?? null);
    }
    return indexThroughMetatable(story, indexFn, keyStr, depth + 1);
  }
  // DivertTargetValue / bare-knot — function form. An index is one value:
  // the handler's first, or nil when it returns none.
  if (isFunctionReference(indexFn)) {
    const results = story.CallLuauFunction(indexFn, [
      base,
      new StringValue(keyStr),
    ]);
    return oneValue((results[0] as AbstractValue) ?? null);
  }
  return null;
}

/** Whether `v` is a function held by reference: a divert target on the
 *  current engine, or a symbol value on the binary program's. */
export function isFunctionReference(v: unknown): boolean {
  return v instanceof DivertTargetValue || v instanceof SymbolValue;
}

/**
 * The pointer at the variable `name` a closure captures or a call passes by
 * reference, resolved against the current frame of `callStack` and
 * registered there as an open upvalue, which the frame closes when the
 * variable's scope or the frame itself ends. A variable a closure already
 * captured gives the pointer it captured, and an open pointer at the same
 * variable of the same frame is shared, so every closure that captures a
 * variable writes one cell.
 */
export function openVariablePointer(
  callStack: CallStack,
  name: string,
): VariablePointerValue {
  let contextIdx = callStack.ContextForVariableNamed(name);
  // Upvalue flattening (Lua semantics): if the slot we're about
  // to point at ALREADY holds a VariablePointerValue — i.e. a
  // captured upval being re-captured by a nested closure
  // (`local a = 1 function foo() return function() return a
  // end end`: foo's prepended upval param `a` holds the pointer
  // to the outer cell) — reuse that pointer directly so every
  // nesting level shares ONE cell. Without this, the inner
  // closure points at foo's slot, reads dereference only one
  // level, and the OUTER pointer leaks out raw (`Can't cast …
  // from 0 to 5` when the leaked pointer hits a comparison).
  const slotValue =
    contextIdx > 0 ? callStack.GetTemporaryVariableWithName(name, contextIdx) : null;
  if (slotValue instanceof VariablePointerValue) {
    return slotValue;
  }
  // Lua-style upvalue dedup: if a closure / by-ref arg created
  // earlier in this frame's lifetime already produced an open
  // pointer for (contextIdx, varName), reuse it so multiple
  // closures share the same cell. The shared pointer also makes
  // the close-on-pop step a single observable event for all
  // closures that captured this variable.
  // The cell records which block scope binds the name here, the
  // binding a closure made at this point captures, so a later inner
  // `local` of the same name doesn't take its place.
  const scopeIdx =
    callStack.elements[contextIdx - 1]?.ScopeIndexBinding(name) ?? -1;
  const existing = callStack.FindOpenUpvalue(contextIdx, name, scopeIdx);
  if (existing) {
    return existing;
  }
  const newPtr = new VariablePointerValue(name, contextIdx);
  newPtr.scopeIndex = scopeIdx;
  callStack.RegisterOpenUpvalue(newPtr, contextIdx);
  return newPtr;
}

// Maps a `NativeFunctionCall` operator name to the Luau metamethod
// that should be consulted when one or both operands carry a
// metatable. Comparison ops `>` and `>=` are intentionally absent —
// they're handled by swapping args and calling `__lt` / `__le`
// (Lua's standard inversion trick), so the symmetric forms below
// suffice. `!=` likewise inverts `__eq`. Unary `_` (negate) and
// `LEN` (length) are unary metamethods.
const BINOP_TO_METAMETHOD: Record<string, string> = {
  "+": "__add",
  "-": "__sub",
  "*": "__mul",
  "/": "__div",
  "//": "__idiv",
  "%": "__mod",
  POW: "__pow",
  "..": "__concat",
  "==": "__eq",
  "!=": "__eq",
  "<": "__lt",
  ">": "__lt",
  "<=": "__le",
  ">=": "__le",
};
const UNOP_TO_METAMETHOD: Record<string, string> = {
  _: "__unm",
  LEN: "__len",
};

// Attempt to dispatch a binary NativeFunctionCall through a metamethod
// when one (or both) operands are ObjectValues with a relevant entry.
// Returns the resulting AbstractValue if a metamethod handled the op;
// `null` to fall through to the regular type-coerced dispatch.
//
// Lua semantics:
//   - Arithmetic / concat / length: check LHS first, then RHS.
//   - `__eq` fires ONLY when both operands are tables (matches Lua's
//     strict-type rule for equality metamethods).
//   - `>` / `>=` are handled by swapping args and calling `__lt` /
//     `__le` (the standard Lua inversion).
//   - `!=` inverts the boolean returned by `__eq` (or the raw `==`
//     comparison if no metamethod fired).
// rawequal for function-shaped values, used by the `__eq` same-handler
// rule. Closure ObjectValues compare by underlying-Map identity (same
// notion as table `==`); bare DivertTargetValues compare by target
// path, so the same named function referenced twice matches even if
// the wrapper instances differ.
function sameLuauFunctionValue(a: any, b: any): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  if (a instanceof ObjectValue && b instanceof ObjectValue) {
    return a.value === b.value;
  }
  if (a instanceof DivertTargetValue && b instanceof DivertTargetValue) {
    return a.value?.toString() === b.value?.toString();
  }
  if (a instanceof SymbolValue && b instanceof SymbolValue) {
    return a.ref.Equals(b.ref);
  }
  return false;
}

// Direct JS-side dispatch for `__stdlib_fn` marker values — stdlib
// builtins referenced first-class and invoked through the JS call
// helpers (e.g. `pcall(rawequal, a, b)`, or a stdlib fn stored in a
// variable handed to `table.sort`). Returns the wrapped result array,
// or `null` when `fnValue` isn't a resolvable stdlib marker. Under-
// application of a fixed-arity entry raises (Lua's C functions check
// required args via `luaL_checkany`), so `pcall(rawequal, "a")` traps
// a missing-argument error instead of comparing against nil — EXCEPT
// for entries marked `validatesArgs`, whose `fn` raises its own
// Luau-exact message (e.g. `missing argument #1 to 'clear' (table
// expected)`); the generic raise can't know the expected type.
export function tryInvokeStdLibMarkerValue(
  story: any,
  fnValue: any,
  args: AbstractValue[],
): AbstractValue[] | null {
  if (!(fnValue instanceof ObjectValue)) return null;
  const tag = (fnValue.value as Map<string, AbstractValue>)?.get(
    "__stdlib_fn",
  );
  if (!(tag instanceof StringValue)) return null;
  const entry = lookupAnyStdLib(tag.value!);
  if (!entry) return null;
  if (
    entry.arity >= 0 &&
    args.length < entry.arity &&
    !(entry as { validatesArgs?: boolean }).validatesArgs
  ) {
    story.Error(`missing argument #${args.length + 1} to '${tag.value}'`);
  }
  const callArgs = unwrapArgsForPureStdLibFn(
    entry,
    entry.arity >= 0 ? args.slice(0, entry.arity) : [...args],
    story,
    tag.value!,
  );
  const result = entry.fn(story, callArgs);
  if (result === undefined) return [];
  const rawResults = Array.isArray(result) ? result : [result];
  const wrapped: AbstractValue[] = [];
  for (const r of rawResults) {
    if (r instanceof InkObject) {
      wrapped.push(r as AbstractValue);
    } else {
      const w = Value.Create(r);
      if (w !== null) wrapped.push(w as AbstractValue);
    }
  }
  return wrapped;
}

function tryBinaryMetamethod(
  story: any,
  opName: string,
  lhs: any,
  rhs: any,
): AbstractValue | null {
  const metaName = BINOP_TO_METAMETHOD[opName];
  if (!metaName) return null;
  // `__eq` is restricted: Lua only fires it when both operands are
  // tables (ObjectValue). For sparkdown the equivalent rule keeps
  // primitive equality (`5 == 5`, `"a" == "a"`) on the regular
  // numeric / string fast path.
  if (metaName === "__eq" && !(lhs instanceof ObjectValue && rhs instanceof ObjectValue)) {
    return null;
  }
  if (!(lhs instanceof ObjectValue) && !(rhs instanceof ObjectValue)) {
    return null;
  }
  // Comparison-symmetry: `a > b` → `__lt(b, a)`; `a >= b` → `__le(b, a)`.
  let callLhs = lhs;
  let callRhs = rhs;
  let invertEq = false;
  if (opName === ">" || opName === ">=") {
    callLhs = rhs;
    callRhs = lhs;
  }
  if (opName === "!=") {
    invertEq = true;
  }
  let handler: any;
  if (metaName === "__eq") {
    // Lua's getequalhandler rule: primitive (reference) equality is
    // checked FIRST — `a == a` never consults the metamethod. The
    // handler then fires only when BOTH operands have an `__eq` and
    // the two handlers are the same value (rawequal). Different
    // handlers → plain reference equality (which is false here,
    // since the primitive check above already ruled out identity).
    if (lhs.value === rhs.value) {
      return new BoolValue(!invertEq);
    }
    // Stdlib markers compare by TAG, not identity — every source
    // reference to `print` builds a fresh marker object, so
    // `a[f] == print` (where a[f] holds a previously-stored `print`)
    // must still be true.
    {
      const tagL = (lhs.value as Map<string, AbstractValue>)?.get(
        "__stdlib_fn",
      );
      const tagR = (rhs.value as Map<string, AbstractValue>)?.get(
        "__stdlib_fn",
      );
      if (tagL instanceof StringValue && tagR instanceof StringValue) {
        const same = tagL.value === tagR.value;
        return new BoolValue(invertEq ? !same : same);
      }
    }
    const handlerL = lookupMetamethod(callLhs, metaName);
    const handlerR = lookupMetamethod(callRhs, metaName);
    if (
      handlerL == null ||
      handlerR == null ||
      handlerL instanceof NullValue ||
      handlerR instanceof NullValue ||
      !sameLuauFunctionValue(handlerL, handlerR)
    ) {
      return null;
    }
    handler = handlerL;
  } else {
    handler =
      lookupMetamethod(callLhs, metaName) ?? lookupMetamethod(callRhs, metaName);
  }
  if (handler == null) return null;
  const results = story.CallLuauFunction(handler, [callLhs, callRhs]) as
    | AbstractValue[]
    | null;
  // An operator's result is one value: the handler's first, or nil.
  const first = oneValue((results && results[0]) || new NullValue());
  // Comparison metamethods return any value; Lua then coerces it to
  // a boolean. Apply the inversion for `!=` after coercion.
  if (metaName === "__eq" || metaName === "__lt" || metaName === "__le") {
    const truthy = first instanceof AbstractValue ? first.isTruthy : false;
    const result = invertEq ? !truthy : truthy;
    return new BoolValue(result);
  }
  return first;
}

// Unary metamethod dispatch — `-x` (`__unm`) and `#x` (`__len`).
// `LEN` for ObjectValue falls through to the existing `t.value.size`
// path when no metamethod is present; that path is in
// `NativeFunctionCall.CallType`.
function tryUnaryMetamethod(
  story: any,
  opName: string,
  operand: any,
): AbstractValue | null {
  const metaName = UNOP_TO_METAMETHOD[opName];
  if (!metaName) return null;
  if (!(operand instanceof ObjectValue)) return null;
  const handler = lookupMetamethod(operand, metaName);
  if (handler == null) return null;
  const results = story.CallLuauFunction(handler, [operand]) as
    | AbstractValue[]
    | null;
  return oneValue((results && results[0]) || new NullValue());
}

// A function container's content starts with its parameter bindings, one
// `VariableAssignment` per parameter, which its entry pops off the eval stack
// (`FlowBase.GenerateArgumentVariableAssignments` writes them before anything
// else), the vararg slot first for a function that declared `...`. A function
// with no parameters starts with its body, which can begin with an assignment
// too (`local t = {}` is a table's commands and then one), so only the run
// from the first item binds parameters.
const isParamBinding = (item: unknown): boolean =>
  typeof (item as { isVarargsSlot?: boolean } | null)?.isVarargsSlot ===
  "boolean";

// Whether the function declared `...`. Used by the multi-return spread logic
// to skip spreading for variadic targets (whose extras have already been
// packed into a `MultiValue` by `PackTuple` at the call site).
function containerIsVariadic(target: any): boolean {
  const first = target?._content?.[0];
  return isParamBinding(first) && first.isVarargsSlot === true;
}

// How many values the function's entry binds, the `__varargs__` slot of a
// variadic function included.
function countLeadingParamBindings(target: any): number {
  const content = target?._content;
  if (!Array.isArray(content)) return 0;
  let n = 0;
  while (n < content.length && isParamBinding(content[n])) {
    n++;
  }
  return n;
}

// Spreads the last of the `count` arguments a call site pushed, as Luau
// passes a call's last argument: a multiple value (a `g()` multi-return)
// gives each of its values, and a call that returned none (`Void`) gives
// none. Returns how many values the arguments are now.
function spreadLastCallArg(story: any, count: number): number {
  if (count <= 0) return count;
  const last = story.state.PeekEvaluationStack();
  if (last instanceof MultiValue) {
    story.state.PopEvaluationStack();
    for (const v of last.values) story.state.PushEvaluationStack(v);
    return count - 1 + last.values.length;
  }
  if (last instanceof Void) {
    story.state.PopEvaluationStack();
    return count - 1;
  }
  return count;
}

// Adjusts each of the `count` arguments a call site pushed but the last to
// one value, as Luau adjusts an expression that does not end a list: a
// multiple value (a `g()` multi-return) gives its first value, or nil when
// it has none, and a call that returned none (`Void`) gives nil. The last
// argument is `spreadLastCallArg`'s.
function adjustEarlierCallArgs(story: any, count: number): void {
  const stack: unknown[] = story.state.evaluationStack;
  const last = stack.length - 1;
  let from = Math.max(0, stack.length - count);
  while (
    from < last &&
    !(stack[from] instanceof MultiValue || stack[from] instanceof Void)
  ) {
    from++;
  }
  if (from >= last) return;
  const lastArg = story.state.PopEvaluationStack();
  const earlier: unknown[] = [];
  for (let i = from; i < last; i++) {
    earlier.unshift(story.state.PopEvaluationStack());
  }
  for (const v of earlier) {
    story.state.PushEvaluationStack(
      v instanceof MultiValue
        ? (v.values[0] ?? new NullValue())
        : v instanceof Void
          ? new NullValue()
          : v,
    );
  }
  story.state.PushEvaluationStack(lastArg);
}

/**
 * Adjusts the `count` arguments a call site pushed to the `fixed` parameters
 * of a function that declared no `...`, as Luau passes a call's arguments:
 * each argument but the last gives one value (`adjustEarlierCallArgs`), the
 * last one spreads (`spreadLastCallArg`), the values past the parameters are
 * dropped once evaluated, and the parameters past the values are nil.
 */
export function adjustCallArgs(story: any, count: number, fixed: number): void {
  adjustEarlierCallArgs(story, count);
  const effective = spreadLastCallArg(story, count);
  for (let i = effective; i < fixed; i++) {
    story.state.PushEvaluationStack(new NullValue());
  }
  for (let i = fixed; i < effective; i++) {
    story.state.PopEvaluationStack();
  }
}

/**
 * Arranges the `callSiteArgCount` arguments a call site pushed for a
 * function of `fixedCount` fixed parameters and a `...`, as Luau passes
 * them: each argument but the last gives one value
 * (`adjustEarlierCallArgs`), the last one spreads (`spreadLastCallArg`),
 * the fixed parameters take the first values, nil past the values, and the
 * rest are packed into one multiple value for the `...` slot's binding. The
 * callable must already be off the stack.
 */
export function packVariadicValueCallArgs(
  story: any,
  callSiteArgCount: number,
  fixedCount: number,
): void {
  adjustEarlierCallArgs(story, callSiteArgCount);
  const effective = spreadLastCallArg(story, callSiteArgCount);
  const args: AbstractValue[] = [];
  for (let i = 0; i < effective; i++) {
    args.unshift(story.state.PopEvaluationStack() as AbstractValue);
  }
  const fixed = args.slice(0, fixedCount);
  while (fixed.length < fixedCount) fixed.push(new NullValue());
  const extras = args.slice(fixedCount);
  for (const a of fixed) story.state.PushEvaluationStack(a);
  story.state.PushEvaluationStack(new MultiValue(extras));
}

/**
 * Arranges the `count` arguments a call site pushed for the function
 * `target` it enters: exactly its parameters (`adjustCallArgs`), or a
 * variadic function's fixed parameters, the values its entry binds less the
 * `...` slot, with the rest packed for its `...`
 * (`packVariadicValueCallArgs`).
 */
export function arrangeArgsFor(
  story: any,
  target: FunctionTarget,
  count: number,
): void {
  if (target.variadic) {
    packVariadicValueCallArgs(story, count, Math.max(0, target.bindings - 1));
  } else {
    adjustCallArgs(story, count, target.bindings);
  }
}

/**
 * Arranges the `count` arguments a call site pushed for `callable`, which
 * is off the stack, when it is a closure: as `arrangeArgsFor` does for a
 * function, with the fixed parameters its table counts
 * (`__closure_user_arity`), before its upvalues are placed below them
 * (`extractClosureTarget`). Returns whether it arranged them; any other
 * callable, and any callable when the count is -1, which says the call site
 * did not record it, takes the arguments as they are.
 */
export function arrangeClosureArgs(
  story: any,
  callable: unknown,
  count: number,
): boolean {
  if (count < 0 || !(callable instanceof ObjectValue)) return false;
  const map = callable.value as Map<string, AbstractValue> | null;
  const arity = map?.get("__closure_user_arity");
  if (!(arity instanceof IntValue)) return false;
  const target: FunctionTarget | null = story.FunctionTargetOf(
    map?.get("__closure_fn"),
  );
  if (target?.variadic) {
    packVariadicValueCallArgs(story, count, arity.value ?? 0);
  } else {
    adjustCallArgs(story, count, arity.value ?? 0);
  }
  return true;
}

/** The parameters the function value `callable` binds: its fixed ones, and
 *  whether a `...` takes the rest. A closure's table says so, and a function
 *  value names the function (`FunctionTargetOf`); any other value, a builtin
 *  or a table, is null. */
function bindingsOf(
  story: any,
  callable: unknown,
): { fixed: number; variadic: boolean } | null {
  if (callable instanceof ObjectValue) {
    const map = callable.value as Map<string, AbstractValue> | null;
    const arity = map?.get("__closure_user_arity");
    if (!(arity instanceof IntValue)) return null;
    const target: FunctionTarget | null = story.FunctionTargetOf(
      map?.get("__closure_fn"),
    );
    // `__closure_user_arity` counts the fixed parameters only.
    return { fixed: arity.value ?? 0, variadic: target?.variadic ?? false };
  }
  const target: FunctionTarget | null = isFunctionReference(callable)
    ? story.FunctionTargetOf(callable)
    : null;
  if (target === null) return null;
  return target.variadic
    ? { fixed: Math.max(0, target.bindings - 1), variadic: true }
    : { fixed: target.bindings, variadic: false };
}

// Lua argument-count normalization for the JS-driven call paths
// (`CallLuauFunction` / `CallLuauFunctionProtected`): extra args are
// DISCARDED and missing args pad with nil, exactly as a Lua call
// site would. Without the truncation, a surplus arg pushed for a
// callee that never pops it survives the call on the eval stack and
// gets mis-collected as a return value — e.g. the `__len` metamethod
// receives the table operand per Lua, but a zero-param handler
// (`__len = function() return 42 end`, or a function declared with no
// parameters) left the table stranded, and `#t` "returned" the table
// itself. Variadic callees bind their fixed params positionally and
// receive the extras packed into one MultiValue (the `__varargs__`
// slot — same shape a static call site's PackTuple produces). The
// parameters come from `bindingsOf`: a closure's table, or the
// function a function value names.
export function normalizeLuauCallArgs(
  story: any,
  fnValue: AbstractValue,
  args: AbstractValue[],
): AbstractValue[] {
  const bindings = bindingsOf(story, fnValue);
  if (bindings === null) return args;
  const arity = bindings.fixed;
  if (bindings.variadic) {
    // Spread a trailing MultiValue, then pack extras beyond the
    // fixed arity for the `...` slot.
    const spread = [...args];
    const last = spread[spread.length - 1];
    if (last instanceof MultiValue) {
      spread.splice(spread.length - 1, 1, ...last.values);
    }
    const fixed = spread.slice(0, arity);
    while (fixed.length < arity) fixed.push(new NullValue());
    return [...fixed, new MultiValue(spread.slice(arity))];
  }
  const out = args.slice(0, arity);
  while (out.length < arity) out.push(new NullValue());
  return out;
}

// Lua-fidelity multi-return spread: if the syntactically LAST arg of
// a function call returned multiple values (a `MultiValue`), spread
// its inner values onto the eval stack so the callee's parameter
// binding pops them individually. Skipped for variadic targets —
// their compile-time `PackTuple` already handled the spread and the
// trailing `MultiValue` is the `__varargs__` slot value. Only for a
// call whose argument count the story does not record; a call that
// records it adjusts its arguments instead (`adjustCallArgs`).
export function spreadLastMultiIfNonVariadic(
  story: any,
  target: FunctionTarget | null,
): void {
  if (target?.variadic) return;
  const stack = story.state.evaluationStack;
  if (stack.length === 0) return;
  const top = stack[stack.length - 1];
  if (!(top instanceof MultiValue)) return;
  story.state.PopEvaluationStack();
  for (const v of top.values) story.state.PushEvaluationStack(v);
}

// `spreadCallArgs` and `oneValue` (`CallArgs.ts`): a builtin's or a
// handler's arguments as a call passes them, and a value where Luau takes
// one, exported here for both engines.
export { oneValue, spreadCallArgs };

// Pushes what a builtin or a function a call ran returned. A JS array is a
// multiple return (`math.modf`, `string.byte`, `table.unpack`), pushed as one
// `MultiValue` slot whose elements are wrapped by `Value.Create`: a
// single-value consumer sees its first value through MultiValue's
// transparent `valueObject`, and a multiple assignment spreads it with
// `UnpackTuple`. An InkObject is pushed as it is, and a JS primitive wrapped
// (number → IntValue/FloatValue, string → StringValue, boolean → BoolValue).
// No value (`table.insert`, `print`, ...) pushes the `Void` sentinel so the
// eval stack stays balanced: a call in statement position is followed by a
// static PopEvaluatedValue, which would otherwise consume whatever operand
// sat beneath (`1 + #pack(7, 8)` lost the `1` to an inner `table.insert`).
// Void coerces to nil in single-value contexts and spreads to zero values in
// call-arg position, matching Lua's "no return values".
export function pushStdLibResult(story: any, result: unknown): void {
  if (result !== undefined) {
    if (Array.isArray(result)) {
      const wrapped: AbstractValue[] = [];
      for (const r of result) {
        if (r instanceof InkObject) {
          wrapped.push(r as AbstractValue);
        } else {
          const w = Value.Create(r);
          if (w !== null) wrapped.push(w);
        }
      }
      story.state.PushEvaluationStack(new MultiValue(wrapped));
    } else if (result instanceof InkObject) {
      story.state.PushEvaluationStack(result as AbstractValue);
    } else {
      const w = Value.Create(result);
      if (w !== null) story.state.PushEvaluationStack(w);
    }
  } else {
    story.state.PushEvaluationStack(new Void());
  }
}

// Pushes the values a `__call` or `__namecall` handler returned: one value,
// several as a multiple value, and none as nil.
function pushCallResults(story: any, results: AbstractValue[] | null): void {
  if (results && results.length === 1) {
    story.state.PushEvaluationStack(results[0]!);
  } else if (results && results.length > 1) {
    story.state.PushEvaluationStack(new MultiValue(results));
  } else {
    story.state.PushEvaluationStack(new NullValue());
  }
}

// Steps a builtin iterator a value holds (`pairs(t)`, `string.gmatch(...)`),
// which advances its own cursor in place: pops the (state, ctrl) arguments of
// the generic-for protocol and pushes the next (key, value) MultiValue. A
// call that says how many arguments it passed (`it()`, `it(s, c, x)`) has
// them adjusted to those two first, as a function of two parameters would.
function stepIteratorCall(story: any, iterator: ObjectValue, count: number): void {
  if (count >= 0) {
    adjustCallArgs(story, count, 2);
  }
  // Args were pushed (state, ctrl) — pops reverse that.
  const iterCtrl = story.state.PopEvaluationStack();
  const iterState = story.state.PopEvaluationStack();
  // A step moves the iterator's cursor, which it keeps in its table.
  story.state.variablesState.WriteBarrier(iterator);
  const result = stepBuiltinIterator(
    iterator,
    iterState as AbstractValue,
    iterCtrl as AbstractValue,
  );
  story.state.PushEvaluationStack(result);
}

// Runs a builtin a value holds (an ObjectValue marked `__stdlib_fn`, which a
// reference to a name like `math.abs` or `select` makes) and pushes its
// result, as a direct call of it runs: the `count` arguments the call site
// pushed, spread by `spreadCallArgs`, of which a builtin of fixed arity takes
// the first it declares, the rest evaluated and dropped. A call that does
// not say how many passes a builtin of fixed arity that many, and cannot call
// a variadic one here: returns false, with the stack untouched.
function runBuiltinCall(
  story: any,
  entry: StdLibEntry,
  name: string,
  count: number,
): boolean {
  const popCount = count >= 0 ? count : entry.arity >= 0 ? entry.arity : -1;
  if (popCount < 0) return false;
  const args: any[] = [];
  for (let i = 0; i < popCount; i++) {
    args.unshift(story.state.PopEvaluationStack());
  }
  spreadCallArgs(args);
  if (entry.arity >= 0 && args.length > entry.arity) {
    args.length = entry.arity;
  }
  const values = unwrapArgsForPureStdLibFn(entry, args, story, name);
  // A builtin of numbers given fewer arguments than it takes raises what its
  // direct call raises (`NativeFunctionCall.Call`), once the arguments it was
  // given are numbers; every other builtin checks its own arguments, as its
  // direct call leaves it to.
  if (values.length < entry.arity && isPureNumberStdLibOp(name)) {
    const short = name.slice(name.lastIndexOf(".") + 1);
    story.Error(`missing argument #${values.length + 1} to '${short}'`);
  }
  pushStdLibResult(story, entry.fn(story, values));
  return true;
}

// Calls the `__call` handler of `table`'s metatable with the table and the
// call's arguments, and pushes what it returns: the `count` arguments the
// call site pushed, spread by `spreadCallArgs`, which `CallLuauFunction`
// adjusts to the handler's parameters. A call that does not say how many
// passes as many as the handler's closure takes besides the table, and none
// to a handler that is a function value.
function callThroughHandler(
  story: any,
  table: AbstractValue,
  callHandler: AbstractValue,
  count: number,
): void {
  let popCount = count;
  if (popCount < 0) {
    popCount = 0;
    if (callHandler instanceof ObjectValue) {
      const arityVal = (callHandler.value as Map<string, AbstractValue>)?.get(
        "__closure_user_arity",
      );
      if (arityVal instanceof IntValue) {
        // The closure's signature is `(self, ...userArgs)`, so self
        // accounts for one of its slots.
        popCount = (arityVal.value ?? 1) - 1;
      }
    }
  }
  const userArgs: AbstractValue[] = [];
  for (let i = 0; i < popCount; i++) {
    userArgs.unshift(story.state.PopEvaluationStack() as AbstractValue);
  }
  if (count >= 0) {
    spreadCallArgs(userArgs);
  }
  pushCallResults(
    story,
    story.CallLuauFunction(callHandler, [table, ...userArgs]) as
      | AbstractValue[]
      | null,
  );
}

/**
 * The draws a shuffle takes in place of its seeded generator, when set: the
 * differential run of the binary program injects one stream into both
 * engines, which seed their shuffles from different names (a container's path
 * here, an alternator's symbol there), so that both pick the same arms
 * (docs/engine/binary-program.md, section 3).
 */
export const shuffleDraws: { next: (() => number) | null } = { next: null };

/**
 * The index a shuffling sequence picks on its `seqCount`th pass over
 * `numElements` arms, as both engines pick it: the arms are drawn without
 * replacement from a generator seeded by `seedText`, the loop over the
 * sequence and the story seed, or from `shuffleDraws` when one is injected.
 */
export function sequenceShuffleIndex(
  seedText: string,
  seqCount: number,
  numElements: number,
  storySeed: number,
): number {
  const loopIndex = seqCount / numElements;
  const iterationIndex = seqCount % numElements;

  let sequenceHash = 0;
  for (let i = 0, l = seedText.length; i < l; i++) {
    sequenceHash += seedText.charCodeAt(i) || 0;
  }
  const randomSeed = sequenceHash + loopIndex + storySeed;
  const random = new PRNG(Math.floor(randomSeed));
  const injected = shuffleDraws.next;
  const draw = injected ?? (() => random.next());

  const unpickedIndices: number[] = [];
  for (let i = 0; i < numElements; ++i) {
    unpickedIndices.push(i);
  }

  for (let i = 0; i <= iterationIndex; ++i) {
    const chosen = draw() % unpickedIndices.length;
    const chosenIndex = unpickedIndices[chosen]!;
    unpickedIndices.splice(chosen, 1);

    if (i == iterationIndex) {
      return chosenIndex;
    }
  }

  throw new Error("Should never reach here");
}

/**
 * A call through what the variable `varName` holds, as a divert whose target
 * is a variable runs it on either engine: a builtin iterator steps, a builtin
 * runs, and a table whose metatable has `__call` calls its handler, each
 * pushing what the call returns; a closure or a function value gives the
 * function to enter, with its arguments arranged for its entry
 * (`arrangeClosureArgs`, `arrangeArgsFor`). Returns that function, or null
 * when the call is done.
 * `callSiteArgCount` is the number of arguments the call site pushed, or -1
 * when the story does not record it.
 */
export function callVariableTarget(
  story: any,
  varName: string | null,
  callSiteArgCount: number = -1,
): FunctionTarget | null {
  const varContents = story.state.variablesState.GetVariableWithName(varName);

  if (varContents == null) {
    story.Error(
      "Tried to divert using a target from a variable that could not be found (" +
        varName +
        ")",
    );
  }
  const arranged = arrangeClosureArgs(story, varContents, callSiteArgCount);
  // Built-in stdlib iterator (`pairs(t)` / `ipairs(t)`)
  // stored in a variable: the call site here is a regular
  // FunctionCall lowered into a variable-target Divert.
  if (varContents instanceof ObjectValue) {
    const tag = (varContents.value as Map<string, AbstractValue>)?.get(
      BUILTIN_ITER_TAG,
    );
    if (tag != null) {
      stepIteratorCall(story, varContents, callSiteArgCount);
      return null;
    }
  }
  // Stdlib-function reference: variable holds an ObjectValue
  // marked with `__stdlib_fn` (the call-site reference resolved
  // to a name like `math.abs` whose actual implementation lives
  // in the STDLIB registry, not as an ink knot). A variadic entry
  // (`arity === -1`) that a story without the call's argument
  // count reaches falls through to the error below.
  if (varContents instanceof ObjectValue) {
    const stdlibTag = (varContents.value as Map<string, AbstractValue>)?.get(
      "__stdlib_fn",
    );
    if (stdlibTag instanceof StringValue) {
      const stdlibName = stdlibTag.value!;
      const entry = lookupAnyStdLib(stdlibName);
      if (entry && runBuiltinCall(story, entry, stdlibName, callSiteArgCount)) {
        return null;
      }
    }
  }

  // Closure value: variable holds a closure-shaped ObjectValue.
  // Rearrange the eval stack (push upvals before user args)
  // and divert to the synthetic knot's path. See
  // `extractClosureTarget` for the shape contract.
  const closureTarget = extractClosureTarget(varContents, story);
  if (closureTarget !== null) {
    // Multi-return spread for a non-variadic closure whose call did not
    // say how many arguments it passed: extractClosureTarget has already
    // pushed the upvals and re-pushed user args, so the spread check sees
    // the syntactically-last user arg on top.
    if (!arranged) {
      spreadLastMultiIfNonVariadic(story, closureTarget);
    }
    return closureTarget;
  }
  if (varContents instanceof ObjectValue) {
    // `__call` metamethod: the variable holds a regular table
    // (not a closure, not a builtin iterator) whose metatable
    // defines `__call`. Returns null to skip the normal divert
    // finalize step (CallLuauFunction set up its own divert +
    // frame).
    const callHandler = lookupMetamethod(varContents, "__call");
    if (callHandler != null) {
      callThroughHandler(story, varContents, callHandler, callSiteArgCount);
      return null;
    }
    // Plain table with no `__call` — fall through to the error.
    story.Error(
      "Tried to divert to a target from a variable, but the variable (" +
        varName +
        ") contained '" +
        varContents +
        "'.",
    );
  }
  const target: FunctionTarget | null = isFunctionReference(varContents)
    ? story.FunctionTargetOf(varContents)
    : null;
  if (target === null) {
    let intContent = asOrNull(varContents, IntValue);
    let errorMessage =
      "Tried to divert to a target from a variable, but the variable (" +
      varName +
      ") didn't contain a divert target, it ";
    if (intContent instanceof IntValue && intContent.value == 0) {
      errorMessage += "was empty/null (the value 0).";
    } else {
      errorMessage += "contained '" + varContents + "'.";
    }
    story.Error(errorMessage);
  }
  // The arguments arranged for the function; a call that did not say how
  // many it passed spreads a last-arg MultiValue for a non-variadic target.
  if (callSiteArgCount >= 0) {
    arrangeArgsFor(story, target!, callSiteArgCount);
  } else {
    spreadLastMultiIfNonVariadic(story, target);
  }
  return target;
}

/**
 * Calls the value on top of the evaluation stack with the arguments below it,
 * as `CallValueAsFunction` does on either engine: a closure, a function value
 * or a variadic function is entered in a new function frame, with its
 * arguments padded, cut, spread or packed for its entry; a builtin iterator
 * steps and a builtin runs; a table calls its `__call` handler, and a nil
 * whose receiver has `__namecall` calls that. `callSiteArgCount` is the
 * number of arguments the call site pushed, or -1 when it did not say.
 */
export function callValueAsFunction(
  story: any,
  callSiteArgCount: number,
): void {
  // Pops a `DivertTargetValue` (regular fn) OR a closure
  // `ObjectValue` off the eval stack and diverts to the
  // corresponding path, pushing a Function call-stack frame
  // so a later `~ret` / `PopFunction` returns control to the
  // instruction after this one.
  //
  // Arguments must already be on the eval stack *below* the target —
  // they remain there for the function's parameter-binding bytecode
  // (a sequence of `temp=` assignments at the function's entry) to
  // pop. A call that says how many it pushed has them arranged for
  // the function first (`arrangeClosureArgs`, `arrangeArgsFor`): spread,
  // cut or padded to its parameters, or packed for its `...` — otherwise
  // the function would bind the LAST args instead of the first
  // (`foo(1, 2, 3)` against `function foo(a, b)` would bind a=2, b=3), or
  // dig into the caller's eval context for missing ones. The call-site
  // arg count is
  // encoded on the ControlCommand via CallValueExpression's
  // `CallValueAsFunction(this.args.length)`; -1 means "untracked"
  // (legacy bytecode).
  //
  // Closure dispatch: when the target is a closure-shaped
  // `ObjectValue` (has `__closure_fn` / `__closure_upvals`
  // entries), the handler pops the K user args (count via
  // `__closure_user_arity`), pushes the N upvals from
  // `__closure_upvals` (in index order), then re-pushes the
  // user args. The synthetic knot's signature was lowered
  // with upvals prepended to user params, so parameter
  // binding reads them in the right order. See
  // `lowerAnonymousFunction` in `lowerExpression.ts`. A call's multiple
  // value as the callee (`mk()()`) calls its first.
  const callTarget = oneValue(story.state.PopEvaluationStack());
  const arranged = arrangeClosureArgs(story, callTarget, callSiteArgCount);
  // Built-in stdlib iterator (`pairs(t)` / `ipairs(t)`)
  // returns an ObjectValue marked with `__builtin_iter`. The
  // iterator advances its own cursor on each call (stored on
  // the same ObjectValue), so we can't dispatch via the
  // closure path — there's no underlying knot to divert to.
  // The step honors (state, ctrl) when state is non-nil
  // (stateless Lua protocol); stateful iterators (gmatch,
  // utf8codes) pass nil state and use the marker's internal
  // cursor.
  if (callTarget instanceof ObjectValue) {
    const tag = (callTarget.value as Map<string, AbstractValue>)?.get(
      BUILTIN_ITER_TAG,
    );
    if (tag != null) {
      stepIteratorCall(story, callTarget, callSiteArgCount);
      return;
    }
  }
  const closureTarget = extractClosureTarget(callTarget, story);
  if (closureTarget !== null) {
    story.EnterFunction(closureTarget);
    // A call that did not say how many args it pushed spreads a
    // last multi-return. ZERO-arg call sites have nothing to
    // spread — the eval stack's top belongs to the CALLER
    // (`local a,b,c = g(), g()`: the second g()'s dispatch must
    // not spread the first g()'s pending multi-return —
    // calls.luau line 207).
    if (!arranged && callSiteArgCount !== 0) {
      spreadLastMultiIfNonVariadic(story, closureTarget);
    }
    return;
  }
  // `__stdlib_fn` marker dispatch: the target is an
  // ObjectValue tagged with a stdlib function name (created
  // by the variable-lookup fallback for stdlib references
  // like `local f = type` / `local abs = math.abs`), which runs
  // with the args the call site pushed (`runBuiltinCall`) —
  // for `for k in next, t do` the generic-for protocol calls
  // the first-class `next` (variadic) with exactly two args
  // (basic.luau lines 253-258).
  if (callTarget instanceof ObjectValue) {
    const stdlibTag = (callTarget.value as Map<string, AbstractValue>)?.get(
      "__stdlib_fn",
    );
    if (stdlibTag instanceof StringValue) {
      const stdlibName = stdlibTag.value!;
      const entry = lookupAnyStdLib(stdlibName);
      if (entry && runBuiltinCall(story, entry, stdlibName, callSiteArgCount)) {
        return;
      }
    }
  }
  // `__call` metamethod: the target is a plain ObjectValue
  // (table) that isn't a closure or builtin iterator, but its
  // metatable defines `__call`. Lua semantics: `t(args...)`
  // becomes `__call(t, args...)`, which `callThroughHandler`
  // dispatches via `story.CallLuauFunction` with the table
  // prepended as `self`.
  if (callTarget instanceof ObjectValue) {
    const callHandler = lookupMetamethod(callTarget, "__call");
    if (callHandler != null) {
      callThroughHandler(story, callTarget, callHandler, callSiteArgCount);
      return;
    }
  }
  const target: FunctionTarget | null = story.FunctionTargetOf(callTarget);
  if (target === null) {
    // `__namecall` fallback (Luau): a colon-call whose method
    // lookup missed arrives here with a NIL target — the
    // receiver was threaded as the FIRST pushed arg
    // (`CallValueExpression(IndexExpression(recv, name),
    // [recv, ...])`). If that receiver's metatable defines
    // `__namecall`, dispatch `__namecall(self, args...)`
    // (basic.luau line 462's userdata namecall). Heuristic:
    // non-colon nil-target calls whose first arg happens to
    // carry __namecall would also match, but Lua errors on
    // those anyway, so the worst case is a more permissive
    // dispatch than stock Luau.
    const nmArgCount = callSiteArgCount;
    if (callTarget instanceof NullValue && nmArgCount >= 1) {
      const nmArgs: AbstractValue[] = [];
      for (let i = 0; i < nmArgCount; i++) {
        nmArgs.unshift(story.state.PopEvaluationStack() as AbstractValue);
      }
      const nmReceiver = nmArgs[0];
      const nmHandler =
        nmReceiver instanceof ObjectValue
          ? lookupMetamethod(nmReceiver, "__namecall")
          : null;
      if (nmHandler != null && !(nmHandler instanceof NullValue)) {
        // The handler takes the call's arguments as a call passes them, as
        // a `__call` handler does (`callThroughHandler`).
        spreadCallArgs(nmArgs);
        pushCallResults(
          story,
          story.CallLuauFunction(nmHandler, nmArgs) as AbstractValue[] | null,
        );
        return;
      }
      // No __namecall — restore the popped args so the error
      // below reports with the stack intact.
      for (const a of nmArgs) story.state.PushEvaluationStack(a);
    }
    // Lua's exact message shape — iter.luau line 174 matches
    // `attempt to call a nil value` through pcall.
    throw new StoryException(
      `attempt to call a ${luauTypeOf(callTarget)} value` +
        (callTarget ? " (got " + callTarget + ")" : ""),
    );
  }
  // The arguments arranged for the function: a variadic function reached
  // as a bare DivertTargetValue (e.g. a sibling variadic subflow passed
  // first-class) gets its extras packed here. A call that did not say how
  // many args it pushed spreads a last multi-return instead.
  if (callSiteArgCount >= 0) {
    arrangeArgsFor(story, target, callSiteArgCount);
  } else {
    spreadLastMultiIfNonVariadic(story, target);
  }
  story.EnterFunction(target);
}

// `t[k] = v` Lua-fidelity dispatch. If `k` already exists directly on
// `t`, the raw set fires immediately (Lua only consults `__newindex`
// on miss). On miss, consult the metatable: function form calls
// `__newindex(t, k, v)`; table form does the full settable operation
// on the target (which may itself chain into a further `__newindex`
// or land in a rawset on the target).
//
// Returns `true` if the metatable handled the write — caller should
// skip its own rawset on the ORIGINAL `base`. `false` means no
// `__newindex` was found at any level; caller falls through to its
// own rawset on `base`.
function newindexThroughMetatable(
  story: any,
  base: any,
  keyStr: string,
  newVal: AbstractValue,
  depth: number = 0,
): boolean {
  const MAX_DEPTH = 32;
  if (depth > MAX_DEPTH) return false;
  if (!(base instanceof ObjectValue)) return false;
  if (base.value?.has(keyStr)) {
    // Lua-fidelity edge case: when called RECURSIVELY (depth > 0,
    // i.e. via a table-form __newindex), the recursion handled the
    // write by doing a settable on the target — and the key already
    // existing in the target means a raw set on it. We do the rawset
    // here so the caller's `return true` short-circuits the outer
    // base's rawset (which is what we want — the original base
    // should NOT receive the value).
    if (depth > 0) {
      if (base.isFrozen) {
        throw new StoryException("attempt to modify a readonly table");
      }
      story.state.variablesState.WriteBarrier(base);
      base.value.set(keyStr, newVal);
      return true;
    }
    return false;
  }
  const newindexFn = lookupMetamethod(base, "__newindex");
  if (newindexFn == null) {
    // No `__newindex` here. If we're in a recursive call (table-form
    // chain), do the rawset on this table — that's the terminal
    // step of the table-form chain. If we're at the top, return
    // false so the caller does its own rawset on the original base.
    if (depth > 0) {
      if (base.isFrozen) {
        throw new StoryException("attempt to modify a readonly table");
      }
      story.state.variablesState.WriteBarrier(base);
      base.value!.set(keyStr, newVal);
      return true;
    }
    return false;
  }
  if (newindexFn instanceof ObjectValue) {
    if (
      (newindexFn.value as Map<string, AbstractValue>)?.get("__closure_fn") !=
      null
    ) {
      story.CallLuauFunction(newindexFn, [
        base,
        new StringValue(keyStr),
        newVal,
      ]);
      return true;
    }
    return newindexThroughMetatable(
      story,
      newindexFn,
      keyStr,
      newVal,
      depth + 1,
    );
  }
  if (isFunctionReference(newindexFn)) {
    story.CallLuauFunction(newindexFn, [
      base,
      new StringValue(keyStr),
      newVal,
    ]);
    return true;
  }
  return false;
}

// The value operations below are the story's own handlers, shared with the
// binary program's engine (`ProgramStory`), which runs the same values
// through them. `story` is either engine: what they read of it is its
// `state` (the globals, the evaluation stack, the output), `Error`,
// `CallLuauFunction` and `FlowValueNamed`, and the call handlers above read
// `FunctionTargetOf` and `EnterFunction` besides.

/** The table the key and value pairs of `between` from `first` on make, as
 *  `EndObject` builds it: a computed key reads as a map key, a nil value is
 *  no entry, and a last value that is a multiple value spreads over the
 *  array positions from its key. */
export function tableFromPairs(
  between: readonly InkObject[],
  first: number,
): ObjectValue {
  const entries = new Map<string, AbstractValue>();
  const pairEnd = between.length - 1; // index of last value
  for (let i = first; i + 1 < between.length; i += 2) {
    // Static keys arrive as StringValues; COMPUTED bracket
    // keys (`{[1+2] = 4}`) arrive as whatever the expression
    // produced — stringify to the canonical map-key form
    // (IntValue 3 → "3", matching how `t[3]` reads index;
    // table/function keys get identity tokens via
    // luauMapKeyString). A key is one value (`{ [f()] = v }`).
    const rawKey =
      between[i] instanceof AbstractValue
        ? oneValue(between[i] as AbstractValue)
        : null;
    const keyObj =
      rawKey instanceof StringValue
        ? rawKey
        : rawKey != null && !(rawKey instanceof NullValue)
          ? new StringValue(luauMapKeyString(rawKey))
          : null;
    let valObj =
      between[i + 1] instanceof AbstractValue
        ? (between[i + 1] as AbstractValue)
        : null;
    if (!keyObj || keyObj.value === null || !valObj) continue;
    // Lua-style table-spread: if this is the LAST entry, its
    // key is a positive integer (array-style), AND its value
    // is a MultiValue, expand into sequential array slots —
    // `{a, b, f()}` where `f()` returns `(10, 20, 30)` lowers
    // to a table with keys "1","2","3","4","5". Non-last
    // MultiValues are truncated to their first inner value
    // (matches Lua: only the last expression spreads).
    const isLast = i + 1 === pairEnd;
    if (
      isLast &&
      valObj instanceof MultiValue &&
      /^[1-9]\d*$/.test(keyObj.value)
    ) {
      const startIdx = parseInt(keyObj.value, 10);
      for (let k = 0; k < valObj.values.length; k++) {
        const spreadVal = valObj.values[k]!;
        // nil entries don't exist (see the non-spread branch).
        if (spreadVal instanceof NullValue) continue;
        entries.set(String(startIdx + k), spreadVal);
      }
    } else {
      if (valObj instanceof MultiValue) {
        valObj = valObj.values[0] ?? new NullValue();
      }
      // Lua: a nil-valued entry does not EXIST — the key is
      // simply absent. `{5, 6, 7, nil, 8}` has keys 1,2,3,5
      // (position counting still advanced past the nil at
      // lower time), so `pairs` yields "1235" and `t[4]` is
      // nil (lines 224-240). DELETE rather than skip:
      // duplicate fields assign left-to-right, so a later
      // `data = nil` must remove an earlier `data = 4`
      // (basic.luau line 328).
      if (valObj instanceof NullValue) {
        entries.delete(keyObj.value);
      } else {
        entries.set(keyObj.value, valObj);
      }
    }
  }
  return new ObjectValue(entries);
}

/** `indexBase[indexKey]`, as `IndexValue` reads it. */
export function indexValue(
  story: any,
  indexBase: InkObject | null,
  indexKey: InkObject | null,
): InkObject {
  // Pops key + container off the eval stack; pushes container[key].
  // For ObjectValue, on a raw miss we consult the metatable's
  // `__index` (table-form chains lookup; function-form calls
  // `__index(t, key)` via story.CallLuauFunction). Lua's
  // `__index` only fires on miss — a present key returns
  // directly without metamethod consultation. A call's multiple value as
  // the table or the key (`mk().x`, `t[f()]`) gives its first.
  indexBase = oneValue(indexBase);
  indexKey = oneValue(indexKey);
  let resolved: InkObject | null = null;
  const keyStr = luauMapKeyString(indexKey);
  // `_G` globals-table proxy: route the read to global
  // variable storage. Misses push nil (Luau's semantics for
  // absent globals), NOT the generic empty-string sentinel
  // below — `_G['nope'] == nil` must hold.
  if (
    indexBase instanceof ObjectValue &&
    indexBase.value?.has(GLOBALS_PROXY_TAG)
  ) {
    return (
      story.state.variablesState.GetGlobalVariableValue(keyStr) ??
      new NullValue()
    );
  }
  // Lua's index-type rule: indexing nil / a boolean / a
  // number / a function raises (trappable via pcall) —
  // `idontexist.a` must NOT silently produce nil.
  {
    const idxErr = luauIndexTargetError(indexBase);
    if (idxErr) {
      story.Error(idxErr);
    }
  }
  if (indexBase instanceof ObjectValue) {
    // Reactive dep tracking: this binding read into a table — record the
    // table's identity so an in-place mutation of it re-runs the binding.
    if (story.state.variablesState.reactiveDepsEnabled) {
      story.state.variablesState.recordReactiveTableRead(indexBase.value!);
    }
    const direct = indexBase.value?.get(keyStr) ?? null;
    if (direct != null) {
      resolved = direct;
    } else {
      resolved = indexThroughMetatable(story, indexBase, keyStr);
    }
  } else if (indexBase instanceof StringValue) {
    // 1-indexed character access, matching Luau's string indexing.
    const intKey = asOrNull(indexKey, IntValue);
    if (intKey !== null && indexBase.value !== null) {
      const i = (intKey.value ?? 0) - 1;
      const ch =
        i >= 0 && i < indexBase.value.length ? indexBase.value[i] : "";
      resolved = new StringValue(ch ?? "");
    }
  }
  if (resolved === null) {
    // Miss → nil. (Formerly an empty-string sentinel from
    // before nil was first-class; `t[missing] == nil` must
    // hold per Lua.)
    resolved = new NullValue();
  }
  return resolved;
}

/** `storeBase[storeKey] = storeValue`, as `StoreIndex` writes it. */
export function storeIndex(
  story: any,
  storeBase: InkObject | null,
  storeKey: InkObject | null,
  storeValue: InkObject | null,
): void {
  // Mutates container[key] = value in place. No result is pushed — this is a
  // statement-level effect. The container must be an ObjectValue
  // looked up from a variable; mutating its internal Map propagates
  // through the variable reference (Maps are passed by reference). A
  // call's multiple value as the table, the key or the value
  // (`mk().x = v`, `t.x = f()`) gives its first, or nil for none.
  storeBase = oneValue(storeBase);
  storeKey = oneValue(storeKey);
  storeValue = oneValue(storeValue);
  // `_G` globals-table proxy: `_G.foo = v` / `_G['foo'] = v`
  // writes the global directly, as an ordinary global assignment.
  if (
    storeBase instanceof ObjectValue &&
    storeBase.value?.has(GLOBALS_PROXY_TAG)
  ) {
    const globalName = storeKey?.toString() ?? "";
    const globalVal = asOrNull(storeValue, AbstractValue);
    if (globalName && globalVal !== null) {
      story.state.variablesState.SetGlobal(globalName, globalVal);
    }
    return;
  }
  if (storeBase instanceof ObjectValue) {
    // Lua rejects nil and NaN as table KEYS on write (reads
    // just produce nil) — `a[NaN] = 1` raises "table index
    // is NaN" through pcall (math.luau NaN section).
    if (storeKey == null || storeKey instanceof NullValue) {
      throw new StoryException("table index is nil");
    }
    {
      const numKey = (storeKey as { value?: unknown }).value;
      if (typeof numKey === "number" && Number.isNaN(numKey)) {
        throw new StoryException("table index is NaN");
      }
    }
    const keyStr = luauMapKeyString(storeKey);
    const val = asOrNull(storeValue, AbstractValue);
    if (storeBase.value && val !== null) {
      // `__newindex`: only consulted on a raw miss (key not
      // already present). If the metatable handles the write,
      // skip the direct mutation. Cycle-bounded recursion via
      // `newindexThroughMetatable`. Frozen tables refuse all
      // writes including through `__newindex`.
      if (storeBase.isFrozen) {
        throw new StoryException("attempt to modify a readonly table");
      }
      if (newindexThroughMetatable(story, storeBase, keyStr, val)) {
        return;
      }
      // Lua: assigning nil REMOVES the key — a nil-valued
      // entry doesn't exist (`t[k] = nil` is the idiomatic
      // delete; `pairs` must not see the key afterwards).
      story.state.variablesState.WriteBarrier(storeBase);
      if (val instanceof NullValue) {
        storeBase.value.delete(keyStr);
      } else {
        storeBase.value.set(keyStr, val);
      }
      // Reactive dep tracking: an in-place table mutation, keyed by the
      // table's backing-Map identity (a binding that read this table
      // re-runs). Cheap no-op when reactive tracking is disabled.
      if (story.state.variablesState.reactiveDepsEnabled) {
        story.state.variablesState.recordReactiveTableChange(storeBase.value);
      }
    }
  } else {
    throw new StoryException("Cannot assign to a property of a non-object value");
  }
}

/** The value of the variable `name`, as a `VariableReference` that names no
 *  read count reads it: `_G`, a global or temporary, a dotted name walked
 *  through tables, a function's name as a function value, a builtin's name
 *  as its marker, and otherwise nil, or the index error Lua raises. */
export function readVariable(story: any, name: string | null): InkObject {
  let foundValue: InkObject | null = null;
  // `_G` — Luau's global environment table. A bare reference
  // resolves to a marker-tagged proxy ObjectValue; the
  // `IndexValue` / `StoreIndex` handlers route reads and writes
  // through global variable storage when they see the tag.
  // (`luauTypeOf` reports ObjectValue as "table", matching
  // `type(_G) == "table"`.)
  if (name === "_G") {
    const proxyMap = new Map<string, AbstractValue>();
    proxyMap.set(GLOBALS_PROXY_TAG, new BoolValue(true));
    return new ObjectValue(proxyMap);
  }

  // Reactive dep tracking: record the global this binding read (the first
  // dotted segment — `player.hp` depends on global `player`). Over-
  // approximate (a local shadowing this name is harmless: a re-eval at
  // worst, never a miss). Cheap no-op when reactive tracking is disabled.
  if (story.state.variablesState.reactiveDepsEnabled && name) {
    story.state.variablesState.recordReactiveGlobalRead(name.split(".")[0]!);
  }

  foundValue = story.state.variablesState.GetVariableWithName(name);

  // Property-access via dotted name (sparkdown extension). If the
  // flat-namespace lookup fails AND the name contains dots, try
  // resolving the FIRST segment as a variable and indexing into
  // its `ObjectValue` (or chained-ObjectValue) by the remaining
  // segments as keys. This matches the same pattern used for
  // `lang.current` lookup elsewhere in this file and lets
  // sparkdown authors write `result.value` against a stored
  // table without needing the bracket-indexer form (`result["value"]`).
  // Falls through to the normal `Variable not found` warning if
  // either the base variable doesn't exist or some intermediate
  // segment isn't an ObjectValue / Map.
  let dottedIndexError: string | null = null;
  // True when the dotted walk's ROOT resolved and the chain
  // legitimately produced nil (missing last member, e.g.
  // `t.data` after a nil-delete) — the read result is nil, not
  // an index error.
  let dottedResolvedToNil = false;
  if (foundValue == null && name && name.includes(".")) {
    const segs = name.split(".");
    // `_G.x[.y...]` — strip the `_G` hop and start the walk at
    // the GLOBAL binding for the next segment. Global-only
    // lookup (not GetVariableWithName) because reads through
    // `_G` must not see a same-named local shadowing the
    // global.
    let walkStart = 1;
    let cur: unknown;
    if (segs[0] === "_G" && segs.length > 1) {
      cur = story.state.variablesState.GetGlobalVariableValue(segs[1]!);
      walkStart = 2;
      if (cur == null) {
        // `_G.x` of an ABSENT global is nil (Luau: the env
        // table simply has no member) — but `_G.x.y` indexes
        // that nil and raises.
        if (segs.length > 2) {
          dottedIndexError = "attempt to index a nil value";
        } else {
          dottedResolvedToNil = true;
        }
      }
    } else {
      cur = story.state.variablesState.GetVariableWithName(segs[0]!);
    }
    if (cur != null) {
      for (let i = walkStart; i < segs.length; i++) {
        const seg = segs[i]!;
        // Lua's index-type rule applies at each hop — indexing
        // nil / a number / a function raises rather than
        // silently producing nil (`local t = nil; t.a` must
        // trap under pcall). Recorded, not thrown, so the
        // knot / stdlib-marker fallbacks below keep their shot
        // at resolving the full dotted name first.
        const idxErr = luauIndexTargetError(cur);
        if (idxErr) {
          dottedIndexError = idxErr;
          cur = null;
          break;
        }
        // `__index` chain — fold each dotted segment through
        // the metatable lookup so `t.x` resolves to either
        // `rawget(t, "x")` (when present) or
        // `__index(t, "x")` / chained-table lookup. Matches
        // the IndexValue ControlCommand's metamethod behavior.
        if (cur instanceof ObjectValue) {
          // Reactive dep tracking: this dotted read walked through `cur` —
          // record its identity so an in-place mutation re-runs the binding.
          if (story.state.variablesState.reactiveDepsEnabled) {
            story.state.variablesState.recordReactiveTableRead(cur.value!);
          }
          const direct = cur.value?.get(seg);
          if (direct != null) {
            cur = direct;
            continue;
          }
          const viaMt = indexThroughMetatable(story, cur, seg);
          if (viaMt != null) {
            cur = viaMt;
            continue;
          }
          // Raw miss: nil when this is the last segment;
          // indexing that nil (more segments remain) raises.
          if (i < segs.length - 1) {
            dottedIndexError = "attempt to index a nil value";
          }
          cur = null;
          break;
        }
        const obj = (cur as any)?.value;
        if (obj instanceof Map) {
          cur = obj.get(seg) ?? null;
          if (cur == null) {
            if (i < segs.length - 1) {
              dottedIndexError = "attempt to index a nil value";
            }
            break;
          }
        } else {
          // Strings reach here (member reads like `("x").nope`
          // resolve to nil, matching the string library's
          // metatable miss); anything else non-indexable was
          // already classified above.
          cur = null;
          break;
        }
      }
      if (cur != null) {
        foundValue = cur as Value<any>;
      } else if (dottedIndexError == null) {
        dottedResolvedToNil = true;
      }
    }
  }

  // Lua-style first-class fn fallback: if no variable named
  // `<name>` exists but a knot/function `<name>` IS defined,
  // resolve to its value: a `DivertTargetValue` pointing at the
  // knot, or on the binary program's engine a symbol value.
  // This makes `local f = double` work as if the user had
  // written `local f = -> double`. Common authoring pattern.
  if (foundValue == null && name) {
    foundValue = story.FlowValueNamed(name);
  }

  // Stdlib-function-name fallback: `type`, `assert`, `print`,
  // etc. are Luau globals that the user can reference as
  // values (`local f = type; f(x)` / `type(type) == 'function'`).
  // No real ink variable exists for them, so push a marker
  // ObjectValue tagged `__stdlib_fn` so `luauTypeOf` reports
  // "function". Actual call dispatch on the marker (`f(x)`)
  // is a separate fix — for now the marker covers the
  // type-inspection cases at least.
  if (foundValue == null && name && isStdLibFunctionName(name)) {
    const marker = new Map<string, AbstractValue>();
    marker.set("__stdlib_fn", new StringValue(name));
    foundValue = new ObjectValue(marker);
  }

  if (foundValue == null) {
    // A dotted read that dead-ended on a non-indexable hop
    // raises now that the knot / stdlib fallbacks have also
    // missed (`local t = nil; t.a` → "attempt to index a nil
    // value", trappable via pcall).
    if (dottedIndexError) {
      story.Error(dottedIndexError);
    }
    // Dotted reads whose ROOT never resolved: classify per
    // Lua's index rule rather than silently producing nil.
    //   - `math.pow.a`  → a stdlib FUNCTION prefix is being
    //     indexed → "attempt to index a function value"
    //   - `math.a.b`    → `math` is a real namespace, `math.a`
    //     is a nil member, indexing it raises; but plain
    //     `math.idontexist` (one unknown segment) stays nil
    //   - `double.a`    → `double` names a knot (a function
    //     value) → "attempt to index a function value"
    //   - `idontexist.a` → indexing nil
    // (Skipped when the walk's root DID resolve and the chain
    // legitimately read a missing last member — that's nil.)
    if (!dottedResolvedToNil && name && name.includes(".")) {
      const segs = name.split(".");
      let prefixIsStdLibFn = false;
      for (let cut = segs.length - 1; cut >= 1; cut--) {
        if (isStdLibFunctionName(segs.slice(0, cut).join("."))) {
          prefixIsStdLibFn = true;
          break;
        }
      }
      if (prefixIsStdLibFn) {
        story.Error("attempt to index a function value");
      }
      if (isStdLibNamespaceName(segs[0]!)) {
        if (segs.length > 2) {
          story.Error("attempt to index a nil value");
        }
      } else if (story.FlowValueNamed(segs[0]!)) {
        story.Error("attempt to index a function value");
      } else {
        story.Error("attempt to index a nil value");
      }
    }
    // Luau-superset semantics: undefined names resolve to `nil`
    // (not `0`). The compile-time "Cannot find variable named"
    // diagnostic is already downgraded to a warning in
    // `VariableReference.ResolveReferences` — runtime stays
    // silent so undefined-as-nil is a clean, non-noisy lookup.
    // Arithmetic on the resulting `NullValue` errors at runtime
    // via `Cast` (same as Lua), which is the correct trap shape
    // for typos. Interpolation / `tostring` produce "nil".
    foundValue = new NullValue();
  }
  return foundValue;
}

// The builtin method `t:random()`, which picks by the story's draw.
const RANDOM_METHOD = `${METHOD_PREFIX}random`;

/** The result of the native function or operator `func` over `funcParams`:
 *  a stdlib namespace a global replaced dispatches the replacement's member,
 *  an operand's metamethod handles the operator, and otherwise the native
 *  function does. */
export function callNativeFunction(
  story: any,
  func: NativeFunctionCall,
  funcParams: InkObject[],
): InkObject | null {
  // Environment override: `getfenv().math = { abs = ... }` (or a
  // plain global assignment `math = {...}`) replaces a stdlib
  // namespace with a user table. Statically-lowered `math.abs(x)`
  // call sites must then dispatch the REPLACEMENT member
  // (basic.luau's testgetfenv reassignment block). Only dotted
  // native names can be overridden, and a global-lookup miss
  // keeps the fast static path.
  const nsDotIdx = func.name.indexOf(".");
  if (nsDotIdx > 0) {
    const nsOverride = story.state.variablesState.GetGlobalVariableValue(
      func.name.slice(0, nsDotIdx),
    ) as AbstractValue | null;
    if (
      nsOverride instanceof ObjectValue &&
      !(nsOverride.value as Map<string, AbstractValue>)?.has(GLOBALS_PROXY_TAG)
    ) {
      const member = (nsOverride.value as Map<string, AbstractValue>)?.get(
        func.name.slice(nsDotIdx + 1),
      );
      if (member != null && !(member instanceof NullValue)) {
        // Padded Void slots represent missing args — drop them;
        // the Lua-call arg normalization pads nil as needed.
        const callArgs = funcParams.filter(
          (p: any) => !(p instanceof Void),
        ) as AbstractValue[];
        const results = story.CallLuauFunction(
          member as AbstractValue,
          callArgs,
        ) as AbstractValue[] | null;
        if (results && results.length === 1) {
          return results[0]!;
        } else if (results && results.length > 1) {
          return new MultiValue(results);
        }
        return new NullValue();
      }
    }
  }
  // Metamethod dispatch: if any operand is an ObjectValue carrying a
  // metatable with a matching `__add` / `__sub` / `__eq` / etc., the
  // metamethod handles the op via `story.CallLuauFunction`. Returns
  // `null` for the common case where no metamethod fires — fall
  // through to the regular type-coerced dispatch below.
  // An operand is one value, so a call that returns a table and more
  // reaches the table's metamethod.
  const fname = func.name;
  const operand = funcParams.length > 0 ? oneValue(funcParams[0]!) : null;
  let mmResult: AbstractValue | null = null;
  if (funcParams.length === 2) {
    mmResult = tryBinaryMetamethod(
      story,
      fname,
      operand,
      oneValue(funcParams[1]!),
    );
  } else if (funcParams.length === 1) {
    mmResult = tryUnaryMetamethod(story, fname, operand);
  }
  if (mmResult !== null) {
    return mmResult;
  }
  // `#` leaves the boundary it finds on the table's map as a hint for the
  // next read, which is part of what the table is, the table a call that
  // returns more gives first included (`#get()`).
  const table = fname === "LEN" && operand instanceof ObjectValue ? operand : null;
  const hint = table ? (table.value as any)?.__luauBoundary : undefined;
  if (table) {
    story.state.variablesState.PrepareTableWrite?.(table);
  }
  // `t:random()` picks by the story's draw.
  if (fname === RANDOM_METHOD) {
    return callBuiltinMethod(fname, funcParams, () =>
      drawStoryRandom(story.state),
    );
  }
  const result = func.Call(funcParams);
  if (table && (table.value as any)?.__luauBoundary !== hint) {
    story.state.variablesState.WriteBarrier(table);
  }
  return result;
}

/** Pops `n` values and pushes them as one multiple value, as `PackTuple`
 *  does: the last value spreads, the others adjust to one value. */
export function packTuple(story: any, n: number): void {
  // Pop N expression results and pack them into one
  // `MultiValue`. Lua/Luau "spread the last expression"
  // semantics applies: the FIRST popped slot (which was
  // the syntactically LAST expression evaluated) spreads
  // its inner values if it's a `MultiValue`; all OTHER
  // popped slots truncate a `MultiValue` to its first
  // inner value. So `return a, b, f()` where f returns
  // `(1, 2, 3)` packs as `MultiValue([a, b, 1, 2, 3])`,
  // while `return f(), b` where f returns `(1, 2, 3)`
  // packs as `MultiValue([1, b])` (f truncated since
  // it's no longer in last position).
  const values: AbstractValue[] = [];
  for (let i = 0; i < n; i++) {
    const v = story.state.PopEvaluationStack() as AbstractValue;
    if (i === 0 && v instanceof MultiValue) {
      // Last expression spreads: prepend each inner value
      // in original order.
      for (let k = v.values.length - 1; k >= 0; k--) {
        values.unshift(v.values[k]!);
      }
    } else if (i === 0 && v instanceof Void) {
      // Last expression returned NO values (a function that
      // fell off its end): it spreads to ZERO values, not a
      // nil — `return t[i], unlpack(t, i+1)` where the
      // terminal recursion level returns nothing must pack
      // exactly the collected items (calls.luau line 204
      // packed one phantom extra per chain).
    } else if (v instanceof MultiValue) {
      // Non-last expression truncates to its first value
      // (or nil if it returned zero values).
      values.unshift(v.values[0] ?? new NullValue());
    } else if (v instanceof Void) {
      // Non-last no-value expression adjusts to nil.
      values.unshift(new NullValue());
    } else {
      values.unshift(v);
    }
  }
  // Variadic call-site spread when extras = 0: the
  // SYNTACTICALLY LAST expression is the call's last regular
  // arg (already pushed before this PackTuple). If it's a
  // MultiValue, spread it so its first inner value stays as
  // the regular arg and the rest land in the vararg
  // MultiValue we're building. E.g. `f(pcall(...))` against
  // `function f(head, ...)`: pcall returns
  // `MultiValue([true, nil])` → head=true, ...=(nil). Only a
  // divert to a variadic flow packs its args at its site now,
  // and a function call of a story written before calls
  // recorded their arg count; a function call packs them when
  // it runs (`arrangeArgsFor`).
  if (n === 0 && story.state.evaluationStack.length > 0) {
    const peeked = story.state.PeekEvaluationStack();
    if (peeked instanceof MultiValue) {
      story.state.PopEvaluationStack();
      if (peeked.values.length > 0) {
        story.state.PushEvaluationStack(peeked.values[0]!);
        for (let k = 1; k < peeked.values.length; k++) {
          values.push(peeked.values[k]!);
        }
      } else {
        story.state.PushEvaluationStack(new NullValue());
      }
    }
  }
  story.state.PushEvaluationStack(new MultiValue(values));
}

/** Pops one value and pushes its first `n` values, padded with nil, the
 *  first on top, as `UnpackTuple` does. */
export function unpackTuple(story: any, n: number): void {
  // Pop the top eval-stack slot. If it's a `MultiValue`,
  // push the first N inner values in REVERSE order so the
  // next N pops match the original push order. If it's any
  // other value, push it as value-0 plus N-1 NullValue
  // placeholders. Emitted by multi-target assignment
  // lowering for `local a, b = expr`.
  //
  // Void-returning callees (e.g. an iterator function that
  // falls through without `return`) get coerced to all-nil:
  // the user sees the same all-nil tuple they'd see from
  // `return` with no values, matching Luau's iterator-end
  // semantics. Without this, downstream `x == nil` checks
  // crash on `Void` (the runtime can't compare Void to any
  // other type).
  const top = story.state.PopEvaluationStack();
  let values: AbstractValue[];
  if (top instanceof MultiValue) {
    values = top.values.slice(0, n);
  } else if (top instanceof Void) {
    values = [];
  } else {
    values = [top as AbstractValue];
  }
  while (values.length < n) {
    values.push(new NullValue());
  }
  for (let i = values.length - 1; i >= 0; i--) {
    story.state.PushEvaluationStack(values[i]!);
  }
}

/** Whether the value on top decides an `and` or an `or` alone, as
 *  `ShortCircuit` tests it: a multiple value adjusts to its first, a call
 *  that returned none to nil, which the operator then yields when it
 *  decides, and a value that does not decide is popped for the right side
 *  to replace. */
export function shortCircuitDecides(story: any, op: "and" | "or"): boolean {
  let lhs = story.state.PeekEvaluationStack() as AbstractValue;
  if (lhs instanceof MultiValue || lhs instanceof Void) {
    // Operator position adjusts a multi-value to one value.
    story.state.PopEvaluationStack();
    lhs = oneValue(lhs);
    story.state.PushEvaluationStack(lhs);
  }
  const truthy = isLuauTruthy(lhs);
  const decides = op === "and" ? !truthy : truthy;
  if (!decides) {
    story.state.PopEvaluationStack();
  }
  return decides;
}

/** Pops a condition and tests it by Luau truthiness, as the `ShortCircuit`
 *  "if" of an `if` expression does. */
export function popLuauCondition(story: any): boolean {
  // Condition position adjusts a multi-value to one value.
  return isLuauTruthy(oneValue(story.state.PopEvaluationStack() as AbstractValue));
}

/** Ends a tag written inside a capture, as `EndTag` does there: the text
 *  written since its `BeginTag` leaves the output and becomes a tag on the
 *  evaluation stack, which the next choice takes with its text. `clean`
 *  cleans the tag's whitespace. Shared by both engines. */
export function captureTag(
  story: { state: any; Error(message: string): void },
  clean: (text: string) => string,
): void {
  const state = story.state;
  let contentStackForTag: InkObject[] = [];
  let outputCountConsumed = 0;
  for (let i = state.outputStream.length - 1; i >= 0; --i) {
    let obj = state.outputStream[i];
    outputCountConsumed++;

    let command = asOrNull(obj, ControlCommand);
    if (command != null) {
      if (command.commandType == ControlCommand.CommandType.BeginTag) {
        break;
      } else {
        story.Error(
          "Unexpected ControlCommand while extracting tag from choice",
        );
        break;
      }
    }
    if (obj instanceof StringValue) {
      contentStackForTag.push(obj);
    }
  }

  // Consume the content that was produced for this string
  state.PopFromOutputStream(outputCountConsumed);
  // Build string out of the content we collected
  let sb = new StringBuilder();
  for (let strVal of contentStackForTag.reverse()) {
    sb.Append(strVal.toString());
  }
  // Pushing to the evaluation stack means it gets picked up
  // when a Choice is generated from the next Choice Point.
  state.PushEvaluationStack(new Tag(clean(sb.toString())));
}

/** Closes the innermost capture of `state`'s output and returns the text it
 *  caught, as `EndString` does; the tags a choice wrote inside it stay in the
 *  output. */
export function captureString(state: any): StringValue {
  let contentStackForString: InkObject[] = [];
  let contentToRetain: InkObject[] = [];

  let outputCountConsumed = 0;
  for (let i = state.outputStream.length - 1; i >= 0; --i) {
    let obj = state.outputStream[i];

    outputCountConsumed++;

    // var command = obj as ControlCommand;
    let command = asOrNull(obj, ControlCommand);
    if (
      command &&
      command.commandType == ControlCommand.CommandType.BeginString
    ) {
      break;
    }
    if (obj instanceof Tag) {
      contentToRetain.push(obj);
    }
    if (obj instanceof StringValue) {
      contentStackForString.push(obj);
    }
  }

  // Consume the content that was produced for this string
  state.PopFromOutputStream(outputCountConsumed);

  // Rescue the tags that we want actually to keep on the output stack
  // rather than consume as part of the string we're building.
  // At the time of writing, this only applies to Tag objects generated
  // by choices, which are pushed to the stack during string generation.
  for (let rescuedTag of contentToRetain) state.PushToOutputStream(rescuedTag);

  // The C# version uses a Stack for contentStackForString, but we're
  // using a simple array, so we need to reverse it before using it
  contentStackForString = contentStackForString.reverse();

  // Build string out of the content we collected
  let sb = new StringBuilder();
  for (let c of contentStackForString) {
    sb.Append(c.toString());
  }
  return new StringValue(sb.toString());
}
