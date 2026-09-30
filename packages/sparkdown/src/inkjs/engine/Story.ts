import { Container } from "./Container";
import { InkObject } from "./Object";
import { JsonSerialisation } from "./JsonSerialisation";
import { StoryState } from "./StoryState";
import type { CallStack } from "./CallStack";
import { ControlCommand } from "./ControlCommand";
import { PushPopType } from "./PushPop";
import { ChoicePoint } from "./ChoicePoint";
import { Choice } from "./Choice";
import { Divert } from "./Divert";
import {
  Value,
  StringValue,
  IntValue,
  FloatValue,
  BoolValue,
  DivertTargetValue,
  VariablePointerValue,
  ListValue,
  ObjectValue,
  AbstractValue,
  MultiValue,
  NullValue,
  SymbolValue,
} from "./Value";
import { Path } from "./Path";
import { Void } from "./Void";
import { Tag } from "./Tag";
import { VariableAssignment } from "./VariableAssignment";
import { VariableReference } from "./VariableReference";
import { NativeFunctionCall } from "./NativeFunctionCall";
import {
  BUILTIN_ITER_TAG,
  GLOBALS_PROXY_TAG,
  isStdLibFunctionName,
  isStdLibNamespaceName,
  luauTypeOf,
  lookupAnyStdLib,
  lookupStateAwareStdLib,
  stepBuiltinIterator,
  unwrapArgsForPureStdLibFn,
} from "./StdLib";
import { EXECUTION_WATCH_STEPS, executionWatch } from "./ExecutionWatch";
import { StepLimitExceeded, StoryException } from "./StoryException";
import { isLuauTruthy } from "./LuauTruthiness";
import { PRNG } from "./PRNG";
import { StringBuilder } from "./StringBuilder";
import { ListDefinitionsOrigin } from "./ListDefinitionsOrigin";
import { ListDefinition } from "./ListDefinition";
import { Pointer } from "./Pointer";
import { InkList, InkListItem, type KeyValuePair } from "./InkList";
import { asOrNull, asOrThrows } from "./TypeAssertion";
import { DebugMetadata } from "./DebugMetadata";
import { throwNullException } from "./NullException";
import { SimpleJson } from "./SimpleJson";
import { ErrorType, type RaisedError, type RuntimeErrorHandler } from "./Error";
import { StructDefinition } from "./StructDefinition";
import type { Simulator } from "./Simulator";

export { InkList } from "./InkList";

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
class ContainerTarget implements FunctionTarget {
  constructor(
    readonly container: any,
    readonly path: Path | null = null,
  ) {}
  get variadic(): boolean {
    return containerIsVariadic(this.container);
  }
  get bindings(): number {
    return countLeadingParamBindings(this.container);
  }
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
      return (results[0] as AbstractValue) ?? null;
    }
    return indexThroughMetatable(story, indexFn, keyStr, depth + 1);
  }
  // DivertTargetValue / bare-knot — function form.
  if (isFunctionReference(indexFn)) {
    const results = story.CallLuauFunction(indexFn, [
      base,
      new StringValue(keyStr),
    ]);
    return (results[0] as AbstractValue) ?? null;
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
  const first = (results && results[0]) || new NullValue();
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
  return (results && results[0]) || new NullValue();
}

// Returns true if the container's first content op is a vararg-slot
// parameter binding — i.e. the target function declared `...` as a
// parameter. Used by the multi-return spread logic to skip spreading
// for variadic targets (whose extras have already been packed into a
// `MultiValue` by `PackTuple` at the call site).
function containerIsVariadic(target: any): boolean {
  if (!target) return false;
  const content = target._content;
  if (!Array.isArray(content)) return false;
  for (const item of content) {
    const va = item as { isVarargsSlot?: boolean; variableName?: string };
    if (va && typeof va.isVarargsSlot === "boolean") {
      return va.isVarargsSlot === true;
    }
    // Skip non-VariableAssignment items (the function entry binding
    // is the first content); bail out if we hit a different kind of
    // op to keep the scan O(1)-ish.
    if (item && (item as any).commandType !== undefined) {
      continue;
    }
    break;
  }
  return false;
}

// Count the leading parameter-binding `VariableAssignment` ops in a
// function container's content — the slots its entry bytecode pops
// off the eval stack. Skips any leading ControlCommands (mirroring
// `containerIsVariadic`'s scan) and stops at the first non-VA item
// after the run starts. For a variadic function the count INCLUDES
// the `__varargs__` slot.
function countLeadingParamBindings(target: any): number {
  if (!target) return 0;
  const content = target._content;
  if (!Array.isArray(content)) return 0;
  let n = 0;
  for (const item of content) {
    const va = item as { isVarargsSlot?: boolean };
    if (va && typeof va.isVarargsSlot === "boolean") {
      n++;
      continue;
    }
    if (n === 0 && item && (item as any).commandType !== undefined) {
      continue;
    }
    break;
  }
  return n;
}

// Lua value-call argument normalization for a VARIADIC target whose
// callee was only known at runtime (the static call site never
// emitted a `PackTuple`): bind the first `fixedCount` args
// positionally (padding missing ones with nil) and pack the rest
// into ONE MultiValue for the `...` slot's parameter binding. The
// callable must already be popped; the user args sit on top of the
// eval stack. A trailing MultiValue (a `g()` multi-return as the
// last call-site arg) spreads first, per Lua.
export function packVariadicValueCallArgs(
  story: any,
  callSiteArgCount: number,
  fixedCount: number,
): void {
  let effective = callSiteArgCount;
  if (effective > 0) {
    const top = story.state.PeekEvaluationStack();
    if (top instanceof MultiValue) {
      story.state.PopEvaluationStack();
      for (const v of top.values) story.state.PushEvaluationStack(v);
      effective += top.values.length - 1;
    }
  }
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

// Lua argument-count normalization for the JS-driven call paths
// (`CallLuauFunction` / `CallLuauFunctionProtected`): extra args are
// DISCARDED and missing args pad with nil, exactly as a Lua call
// site would. Without the truncation, a surplus arg pushed for a
// callee that never pops it survives the call on the eval stack and
// gets mis-collected as a return value — e.g. the `__len` metamethod
// receives the table operand per Lua, but a zero-param handler
// (`__len = function() return 42 end`) left the table stranded, and
// `#t` "returned" the table itself. Variadic callees bind their
// fixed params positionally and receive the extras packed into one
// MultiValue (the `__varargs__` slot — same shape a static call
// site's PackTuple produces); arity comes from the closure's
// `__closure_user_arity` field, so plain DivertTargetValue functions
// (top-level knots) pass through unchanged.
export function normalizeLuauCallArgs(
  story: any,
  fnValue: AbstractValue,
  args: AbstractValue[],
): AbstractValue[] {
  if (!(fnValue instanceof ObjectValue)) return args;
  const map = fnValue.value as Map<string, AbstractValue> | null;
  const arityVal = map?.get("__closure_user_arity");
  if (!(arityVal instanceof IntValue) || typeof arityVal.value !== "number") {
    return args;
  }
  const arity = arityVal.value;
  const target: FunctionTarget | null = story.FunctionTargetOf(
    map?.get("__closure_fn"),
  );
  if (target?.variadic) {
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
// trailing `MultiValue` is the `__varargs__` slot value.
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

// Pushes what a builtin or a function a call ran returned: nothing is a
// no-value `Void`, a JS array a multiple value, and a JS value its runtime
// value.
function pushStdLibResult(story: any, result: unknown): void {
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
    // Void return (`print`, `table.insert`, ...): push
    // the Void sentinel so the eval stack stays
    // balanced — same contract as RunStdLibFunction.
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

/**
 * A call through what the variable `varName` holds, as a divert whose target
 * is a variable runs it on either engine: a builtin iterator steps, a builtin
 * of fixed arity runs, and a table whose metatable has `__call` calls its
 * handler, each pushing what the call returns; a closure or a function value
 * gives the function to enter, with its arguments arranged for its entry.
 * Returns that function, or null when the call is done.
 */
export function callVariableTarget(
  story: any,
  varName: string | null,
): FunctionTarget | null {
  const varContents = story.state.variablesState.GetVariableWithName(varName);

  if (varContents == null) {
    story.Error(
      "Tried to divert using a target from a variable that could not be found (" +
        varName +
        ")",
    );
  }
  // Built-in stdlib iterator (`pairs(t)` / `ipairs(t)`)
  // stored in a variable: the call site here is a regular
  // FunctionCall lowered into a variable-target Divert. The
  // iterator advances its own cursor in place; we pop the
  // (state, ctrl) args the call site pushed and replace
  // them with the next (key, value) MultiValue.
  if (varContents instanceof ObjectValue) {
    const tag = (varContents.value as Map<string, AbstractValue>)?.get(
      BUILTIN_ITER_TAG,
    );
    if (tag != null) {
      // Args were pushed (state, ctrl) — pops reverse that.
      const iterCtrl = story.state.PopEvaluationStack();
      const iterState = story.state.PopEvaluationStack();
      const result = stepBuiltinIterator(
        varContents,
        iterState as AbstractValue,
        iterCtrl as AbstractValue,
      );
      // A step moves the iterator's cursor, which it keeps in its table.
      story.state.variablesState.WriteBarrier(varContents);
      story.state.PushEvaluationStack(result);
      return null;
    }
  }
  // Stdlib-function reference: variable holds an ObjectValue
  // marked with `__stdlib_fn` (the call-site reference resolved
  // to a name like `math.abs` whose actual implementation lives
  // in the STDLIB registry, not as an ink knot). Look up the
  // entry, pop its args, invoke `entry.fn`, push the result.
  // Variadic stdlib entries (`arity === -1`) can't be dispatched
  // here yet — the call site didn't push an arg count — and
  // fall through to the existing error. Fixed-arity entries
  // (which covers the common case: `math.abs`, `tostring`,
  // `type`, etc.) work.
  if (varContents instanceof ObjectValue) {
    const stdlibTag = (varContents.value as Map<string, AbstractValue>)?.get(
      "__stdlib_fn",
    );
    if (stdlibTag instanceof StringValue) {
      const stdlibName = stdlibTag.value;
      const entry = lookupAnyStdLib(stdlibName!);
      if (entry && entry.arity >= 0) {
        const args: any[] = [];
        for (let i = 0; i < entry.arity; i++) {
          args.unshift(story.state.PopEvaluationStack());
        }
        // Last-arg MultiValue spread (matches RunStdLibFunction
        // semantics). Earlier args truncate any MultiValue to
        // its first inner value.
        for (let k = 0; k < args.length; k++) {
          const a = args[k];
          if (a instanceof MultiValue) {
            if (k === args.length - 1) {
              args.splice(k, 1, ...a.values);
            } else {
              args[k] = a.values[0] ?? new NullValue();
            }
          }
        }
        pushStdLibResult(
          story,
          entry.fn(
            story,
            unwrapArgsForPureStdLibFn(entry, args, story, stdlibName!),
          ),
        );
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
    // Multi-return spread for non-variadic closures: see the
    // helper. extractClosureTarget has already pushed the upvals
    // and re-pushed user args, so the spread check sees the
    // syntactically-last user arg on top.
    spreadLastMultiIfNonVariadic(story, closureTarget);
    return closureTarget;
  }
  if (varContents instanceof ObjectValue) {
    // `__call` metamethod: the variable holds a regular table
    // (not a closure, not a builtin iterator) whose metatable
    // defines `__call`. Dispatch via the same handler used in
    // the `CallValueAsFunction` op. Returns null to skip the
    // normal divert finalize step (CallLuauFunction set up
    // its own divert + frame).
    const callHandler = lookupMetamethod(varContents, "__call");
    if (callHandler != null) {
      const userArgs: AbstractValue[] = [];
      if (callHandler instanceof ObjectValue) {
        const arityVal = (callHandler.value as Map<string, AbstractValue>)?.get(
          "__closure_user_arity",
        );
        if (arityVal instanceof IntValue) {
          const userArity = arityVal.value ?? 1;
          for (let i = 0; i < userArity - 1; i++) {
            userArgs.unshift(story.state.PopEvaluationStack() as AbstractValue);
          }
        }
      }
      const args = [varContents as AbstractValue, ...userArgs];
      pushCallResults(
        story,
        story.CallLuauFunction(callHandler, args) as AbstractValue[] | null,
      );
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
  // Spread last-arg MultiValue for non-variadic targets.
  spreadLastMultiIfNonVariadic(story, target);
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
  // pop.
  //
  // Closure dispatch: when the target is a closure-shaped
  // `ObjectValue` (has `__closure_fn` / `__closure_upvals`
  // entries), the handler pops the K user args (count via
  // `__closure_user_arity`), pushes the N upvals from
  // `__closure_upvals` (in index order), then re-pushes the
  // user args. The synthetic knot's signature was lowered
  // with upvals prepended to user params, so parameter
  // binding reads them in the right order. See
  // `lowerAnonymousFunction` in `lowerExpression.ts`.
  //
  // Luau under-supplied args: if the call site pushed fewer
  // args than the closure's user arity, pad with `NullValue`
  // BEFORE popping for upval reordering — otherwise
  // `extractClosureTarget` would dig into the caller's eval
  // context. The call-site arg count is encoded on the
  // ControlCommand via CallValueExpression's
  // `CallValueAsFunction(this.args.length)`; -1 means
  // "untracked" (legacy bytecode).
  if (callSiteArgCount >= 0) {
    // Peek the callTarget BEFORE popping to know the closure's
    // user arity, then normalize the eval-stack args to
    // exactly `userArity` values so `extractClosureTarget` can
    // pop them cleanly. Two adjustments:
    //   1. If the LAST positional arg is a MultiValue (from
    //      `g()` returning multiple values), spread its inner
    //      values inline. This is what
    //      `spreadLastMultiIfNonVariadic` does, but we need
    //      it BEFORE the pop loop so the count is right.
    //   2. If after spread the effective arg count is still
    //      less than `userArity`, pad with nil on top so the
    //      missing trailing params bind to nil rather than
    //      digging into caller-context.
    const peeked = story.state.PeekEvaluationStack();
    if (peeked instanceof ObjectValue) {
      const peekedMap = peeked.value as Map<string, AbstractValue>;
      const userArityVal = peekedMap?.get("__closure_user_arity");
      if (userArityVal instanceof IntValue) {
        const userArity = userArityVal.value ?? 0;
        // VARIADIC closure target: `__closure_user_arity`
        // counts fixed params only; the extras must pack into
        // one MultiValue for the `...` slot instead of being
        // dropped by the overflow logic below.
        const fnTarget: FunctionTarget | null = story.FunctionTargetOf(
          peekedMap?.get("__closure_fn"),
        );
        const isVariadicTarget = fnTarget?.variadic ?? false;
        if (isVariadicTarget) {
          const callable = story.state.PopEvaluationStack();
          packVariadicValueCallArgs(story, callSiteArgCount, userArity);
          story.state.PushEvaluationStack(callable as AbstractValue);
        } else {
          const callable = story.state.PopEvaluationStack();
          let effectiveArgCount = callSiteArgCount;
          if (callSiteArgCount > 0) {
            const lastArg = story.state.PeekEvaluationStack();
            if (lastArg instanceof MultiValue) {
              story.state.PopEvaluationStack();
              for (const v of lastArg.values) {
                story.state.PushEvaluationStack(v);
              }
              effectiveArgCount = callSiteArgCount - 1 + lastArg.values.length;
            }
          }
          if (effectiveArgCount < userArity) {
            for (let i = effectiveArgCount; i < userArity; i++) {
              story.state.PushEvaluationStack(new NullValue());
            }
          } else if (effectiveArgCount > userArity) {
            // Lua overflow semantics: extra args at a non-variadic
            // call site are dropped. Without this the closure's
            // param binding would pop the LAST args instead of
            // the first — `foo(1, 2, 3)` against `function
            // foo(a, b)` would bind a=2, b=3 (wrong) instead of
            // a=1, b=2.
            for (let i = userArity; i < effectiveArgCount; i++) {
              story.state.PopEvaluationStack();
            }
          }
          story.state.PushEvaluationStack(callable as AbstractValue);
        }
      }
    }
  }
  const callTarget = story.state.PopEvaluationStack();
  // Built-in stdlib iterator (`pairs(t)` / `ipairs(t)`)
  // returns an ObjectValue marked with `__builtin_iter`. The
  // iterator advances its own cursor on each call (stored on
  // the same ObjectValue), so we can't dispatch via the
  // closure path — there's no underlying knot to divert to.
  // Instead, pop the (state, ctrl) args that the generic-for
  // call site pushed, advance the iterator, and push the
  // resulting (key, value) pair as a MultiValue.
  if (callTarget instanceof ObjectValue) {
    const tag = (callTarget.value as Map<string, AbstractValue>)?.get(
      BUILTIN_ITER_TAG,
    );
    if (tag != null) {
      // Call sites push 2 args (state, ctrl) — both the
      // generic-for protocol and manual iterator invocation
      // (`inext(t, 2)`). Pops reverse the push order. The
      // step honors them when state is non-nil (stateless
      // Lua protocol); stateful iterators (gmatch,
      // utf8codes) pass nil state and use the marker's
      // internal cursor.
      const iterCtrl = story.state.PopEvaluationStack();
      const iterState = story.state.PopEvaluationStack();
      const result = stepBuiltinIterator(
        callTarget,
        iterState as AbstractValue,
        iterCtrl as AbstractValue,
      );
      // A step moves the iterator's cursor, which it keeps in its table.
      story.state.variablesState.WriteBarrier(callTarget);
      story.state.PushEvaluationStack(result);
      return;
    }
  }
  const closureTarget = extractClosureTarget(callTarget, story);
  if (closureTarget !== null) {
    story.EnterFunction(closureTarget);
    // ZERO-arg call sites have nothing to spread — the eval
    // stack's top belongs to the CALLER (`local a,b,c = g(),
    // g()`: the second g()'s dispatch must not spread the
    // first g()'s pending multi-return — calls.luau line 207).
    if (callSiteArgCount !== 0) {
      spreadLastMultiIfNonVariadic(story, closureTarget);
    }
    return;
  }
  // `__stdlib_fn` marker dispatch: the target is an
  // ObjectValue tagged with a stdlib function name (created
  // by the variable-lookup fallback for stdlib references
  // like `local f = type` / `local abs = math.abs`). Look up
  // the entry, pop args by its fixed arity, invoke `entry.fn`,
  // and push the result. Variadic stdlib entries (`arity ===
  // -1`) dispatch using the CALL-SITE arg count carried on
  // the CallValueAsFunction command (`_callValueArgCount`,
  // set by CallValueExpression at lower time) — needed for
  // `for k in next, t do` where the generic-for protocol
  // calls the first-class `next` (variadic) with exactly two
  // args (basic.luau lines 253-258).
  if (callTarget instanceof ObjectValue) {
    const stdlibTag = (callTarget.value as Map<string, AbstractValue>)?.get(
      "__stdlib_fn",
    );
    if (stdlibTag instanceof StringValue) {
      const stdlibName = stdlibTag.value;
      const entry = lookupAnyStdLib(stdlibName!);
      const popCount =
        entry && entry.arity >= 0
          ? entry.arity
          : entry && callSiteArgCount >= 0
            ? callSiteArgCount
            : -1;
      if (entry && popCount >= 0) {
        const args: any[] = [];
        for (let i = 0; i < popCount; i++) {
          args.unshift(story.state.PopEvaluationStack());
        }
        for (let k = 0; k < args.length; k++) {
          const a = args[k];
          if (a instanceof MultiValue) {
            if (k === args.length - 1) {
              args.splice(k, 1, ...a.values);
            } else {
              args[k] = a.values[0] ?? new NullValue();
            }
          }
        }
        pushStdLibResult(
          story,
          entry.fn(
            story,
            unwrapArgsForPureStdLibFn(entry, args, story, stdlibName!),
          ),
        );
        return;
      }
    }
  }
  // `__call` metamethod: the target is a plain ObjectValue
  // (table) that isn't a closure or builtin iterator, but its
  // metatable defines `__call`. Lua semantics: `t(args...)`
  // becomes `__call(t, args...)`. Dispatched via
  // `story.CallLuauFunction` with the table prepended as
  // `self`. Limitation: closure-form `__call` handlers infer
  // the user-arg count from `__closure_user_arity`; bare
  // DivertTarget handlers (no upvalues, no arity metadata)
  // are called with only `self` as the arg — extra user args
  // pushed at the call site remain on the eval stack and may
  // disturb subsequent operations. Authors hitting this can
  // wrap the handler as a closure (e.g. add a stub upval) to
  // force the closure path.
  if (callTarget instanceof ObjectValue) {
    const callHandler = lookupMetamethod(callTarget, "__call");
    if (callHandler != null) {
      const userArgs: AbstractValue[] = [];
      if (callHandler instanceof ObjectValue) {
        const arityVal = (callHandler.value as Map<string, AbstractValue>)?.get(
          "__closure_user_arity",
        );
        if (arityVal instanceof IntValue) {
          const userArity = arityVal.value ?? 1;
          // Pop (userArity - 1) user args — the closure's
          // signature is `(self, ...userArgs)`, so self
          // accounts for one of its slots.
          for (let i = 0; i < userArity - 1; i++) {
            userArgs.unshift(story.state.PopEvaluationStack() as AbstractValue);
          }
        }
      }
      const args = [callTarget as AbstractValue, ...userArgs];
      pushCallResults(
        story,
        story.CallLuauFunction(callHandler, args) as AbstractValue[] | null,
      );
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
  story.EnterFunction(target);
  if (target.variadic && callSiteArgCount >= 0) {
    // Variadic function reached as a bare DivertTargetValue
    // (e.g. a sibling variadic subflow passed first-class):
    // no static PackTuple ran, so bind fixed params
    // positionally and pack the extras here. Fixed count =
    // the target's param-binding slots minus the `...` slot.
    const fixedCount = Math.max(0, target.bindings - 1);
    packVariadicValueCallArgs(story, callSiteArgCount, fixedCount);
  } else if (callSiteArgCount !== 0) {
    // Zero-arg call sites have nothing to spread — don't
    // touch the caller's pending eval-stack values.
    spreadLastMultiIfNonVariadic(story, target);
  }
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
      base.value.set(keyStr, newVal);
      story.state.variablesState.WriteBarrier(base);
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
      base.value!.set(keyStr, newVal);
      story.state.variablesState.WriteBarrier(base);
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
    // luauMapKeyString).
    const rawKey =
      between[i] instanceof AbstractValue ? (between[i] as AbstractValue) : null;
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
  // directly without metamethod consultation.
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
  // through the variable reference (Maps are passed by reference).
  //
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
      if (val instanceof NullValue) {
        storeBase.value.delete(keyStr);
      } else {
        storeBase.value.set(keyStr, val);
      }
      story.state.variablesState.WriteBarrier(storeBase);
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
  const fname = func.name;
  let mmResult: AbstractValue | null = null;
  if (funcParams.length === 2) {
    mmResult = tryBinaryMetamethod(story, fname, funcParams[0], funcParams[1]);
  } else if (funcParams.length === 1) {
    mmResult = tryUnaryMetamethod(story, fname, funcParams[0]);
  }
  if (mmResult !== null) {
    return mmResult;
  }
  // `#` leaves the boundary it finds on the table's map as a hint for the
  // next read, which is part of what the table is.
  const table =
    fname === "LEN" && funcParams[0] instanceof ObjectValue
      ? funcParams[0]
      : null;
  const hint = table ? (table.value as any)?.__luauBoundary : undefined;
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
  // `MultiValue([true, nil])` → head=true, ...=(nil).
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
 *  `ShortCircuit` tests it: a multiple value adjusts to its first, and a
 *  value that does not decide is popped for the right side to replace. */
export function shortCircuitDecides(story: any, op: "and" | "or"): boolean {
  let lhs = story.state.PeekEvaluationStack() as AbstractValue;
  if (lhs instanceof MultiValue) {
    // Operator position adjusts a multi-value to one value.
    story.state.PopEvaluationStack();
    lhs = (lhs.values[0] as AbstractValue) ?? new NullValue();
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
  let cond = story.state.PopEvaluationStack() as AbstractValue;
  if (cond instanceof MultiValue) {
    // Condition position adjusts a multi-value to one value.
    cond = (cond.values[0] as AbstractValue) ?? new NullValue();
  }
  return isLuauTruthy(cond);
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

export class Story extends InkObject {
  public static inkVersionCurrent = 22;

  public inkVersionMinimumCompatible = 18;

  public pauseBeforeEvaluatingConditions: boolean = false;

  public pausedBeforeCondition: string | null = null;

  /** Every `Step()` this story has run, the steps of Luau callbacks included.
   *  A callback runs all of its steps inside the one step that called it, so a
   *  caller that budgets execution per `ContinueAsync()` charges the difference
   *  in this count, not one step per call. */
  public stepCount = 0;

  /** The `stepCount` past which `Step()` throws {@link StepLimitExceeded}, or
   *  null for none. A caller that budgets execution sets it around a
   *  `ContinueAsync()`, so the budget also stops the steps of callbacks, which
   *  run before that call returns. */
  public stepLimit: number | null = null;

  public simulator?: Simulator | null = null;

  get currentChoices() {
    let choices: Choice[] = [];

    if (this._state === null) {
      return throwNullException("this._state");
    }
    for (let c of this._state.currentChoices) {
      if (!c.isInvisibleDefault) {
        c.index = choices.length;
        choices.push(c);
      }
    }

    return choices;
  }

  get currentText() {
    this.IfAsyncWeCant("call currentText since it's a work in progress");
    return this.state.currentText;
  }

  get currentTags() {
    this.IfAsyncWeCant("call currentTags since it's a work in progress");
    return this.state.currentTags;
  }

  /** The live instruction tables the `display(<table>)` calls emitted this
   *  beat (empty otherwise). See
   *  {@link StoryState.currentDisplayInstructions}. */
  get currentDisplayInstructions() {
    this.IfAsyncWeCant(
      "call currentDisplayInstructions since it's a work in progress",
    );
    return this.state.currentDisplayInstructions;
  }

  /** Whether the last continue brought anything to show: text, a display
   *  table or choices. A continue returns at its line's newline, so the next
   *  one can complete with none of them, having run through logic to the
   *  story's end or on into more of the story. A host makes no beat of it. */
  get continueShowedSomething() {
    return (
      Boolean(this.currentText) ||
      this.currentDisplayInstructions.length > 0 ||
      this.currentChoices.length > 0
    );
  }

  get currentErrors() {
    return this.state.currentErrors;
  }

  get currentWarnings() {
    return this.state.currentWarnings;
  }

  get currentFlowName() {
    return this.state.currentFlowName;
  }

  get currentFlowIsDefaultFlow() {
    return this.state.currentFlowIsDefaultFlow;
  }

  get aliveFlowNames() {
    return this.state.aliveFlowNames;
  }

  get hasError() {
    return this.state.hasError;
  }

  get hasWarning() {
    return this.state.hasWarning;
  }

  get variablesState() {
    return this.state.variablesState;
  }

  get listDefinitions() {
    return this._listDefinitions;
  }

  get structDefinitions() {
    return this._structDefinitions;
  }

  get state() {
    return this._state;
  }

  /**
   * True when the state is exactly what `ResetState` left behind: the globals
   * have been evaluated and nothing has advanced, diverted, loaded or written
   * over them since.
   *
   * Evaluating the globals means running the whole `global decl` container —
   * every definition in the program, and every builtin seeded alongside them —
   * so a caller that resets a story only to guarantee a known starting point
   * can ask this first and reset nothing when the answer is yes. Any story
   * whose state has been touched in a way the runtime cannot account for
   * reports false, so the answer is only ever conservative.
   *
   * The answer is only as good as the list of places that clear it, so they are
   * named here for anyone adding a method or re-syncing this engine:
   * `ContinueInternal`, `ChoosePath`, `ResetCallstack`, `SwitchFlow`,
   * `RemoveFlow`, `SwitchToDefaultFlow`, `VariableStateDidChangeEvent` (a
   * global written from outside) and `StoryState.LoadJsonObj` (through
   * {@link NoteStateChanged}). A new path that changes state belongs on that
   * list.
   */
  get stateIsPristine(): boolean {
    return this._stateIsPristine;
  }

  /** Record that the state is no longer the untouched one `ResetState` built.
   *  Called by every runtime path that advances, diverts, replaces or writes
   *  over the state, including from `StoryState` itself. */
  public NoteStateChanged() {
    this._stateIsPristine = false;
  }

  public onError: RuntimeErrorHandler | null = null;

  public onDidContinue: (() => void) | null = null;

  public onMakeChoice: ((arg1: Choice) => void) | null = null;

  public onEvaluateCondition: ((arg1: boolean) => void) | null = null;

  public onEvaluateFunction: ((arg1: string, arg2: any[]) => void) | null =
    null;

  public onCompleteEvaluateFunction:
    | ((arg1: string, arg2: any[], arg3: string, arg4: any) => void)
    | null = null;

  public onChoosePathString: ((arg1: string, arg2: any[]) => void) | null =
    null;

  public onExecute: ((arg1: string | undefined) => void) | null = null;

  public onWriteRuntimeObject?: (
    writer: SimpleJson.Writer,
    obj: InkObject,
  ) => boolean = undefined;

  // TODO: Implement Profiler
  public StartProfiling() {
    /* */
  }
  public EndProfiling() {
    /* */
  }

  constructor(
    contentContainer: Container,
    lists: ListDefinition[] | null,
    structs: StructDefinition[] | null,
  );
  constructor(jsonString: string);
  constructor(json: Record<string, any>);
  constructor() {
    super();

    // Discrimination between constructors
    let contentContainer: Container;
    let lists: ListDefinition[] | null = null;
    let structs: StructDefinition[] | null = null;
    let json: Record<string, any> | null = null;

    if (arguments[0] instanceof Container) {
      contentContainer = arguments[0] as Container;

      if (typeof arguments[1] !== "undefined") {
        lists = arguments[1] as ListDefinition[];
      }

      if (typeof arguments[2] !== "undefined") {
        structs = arguments[2] as StructDefinition[];
      }

      // ------ Story (Container contentContainer, List<Runtime.ListDefinition> lists = null)
      this._mainContentContainer = contentContainer;
      // ------
    } else {
      if (typeof arguments[0] === "string") {
        let jsonString = arguments[0] as string;

        json = SimpleJson.TextToDictionary(jsonString);
      } else {
        json = arguments[0] as Record<string, any>;
      }
    }

    // ------ Story (Container contentContainer, List<Runtime.ListDefinition> lists = null)
    if (lists != null) {
      this._listDefinitions = new ListDefinitionsOrigin(lists);
    }

    if (structs != null) {
      this._structDefinitions = {};
      for (const struct of structs) {
        const type = struct.type;
        const name = struct.name;
        if (type) {
          this._structDefinitions[type] ??= {};
          if (name) {
            this._structDefinitions[type][name] = struct.value;
          }
        }
      }
    }

    this._externals = new Map();
    // ------

    // ------ Story(string jsonString) : this((Container)null)
    if (json !== null) {
      let rootObject: Record<string, any> = json;

      let versionObj = rootObject["inkVersion"];
      if (versionObj == null)
        throw new Error(
          "ink version number not found. Are you sure it's a valid .ink.json file?",
        );

      let formatFromFile = parseInt(versionObj);
      if (formatFromFile > Story.inkVersionCurrent) {
        throw new Error(
          "Version of ink used to build story was newer than the current version of the engine",
        );
      } else if (formatFromFile < this.inkVersionMinimumCompatible) {
        throw new Error(
          "Version of ink used to build story is too old to be loaded by this version of the engine",
        );
      } else if (formatFromFile != Story.inkVersionCurrent) {
        console.warn(
          `WARNING: Version of ink ${Story.inkVersionCurrent} used to build story doesn't match current version of engine (${formatFromFile}). Non-critical, but recommend synchronising.`,
        );
      }

      let rootToken = rootObject["root"];
      if (rootToken == null)
        throw new Error(
          "Root node for ink not found. Are you sure it's a valid .ink.json file?",
        );

      let listDefsObj;
      if ((listDefsObj = rootObject["listDefs"])) {
        this._listDefinitions =
          JsonSerialisation.JTokenToListDefinitions(listDefsObj);
      }

      // Names declared with `const`. They initialize like any other global
      // (so they are inspectable at runtime — e.g. by the debug adapter),
      // but they are immutable and fully reconstructed from the bytecode on
      // every run, so they are never written to a save and never restored
      // from one. See `VariablesState.constantNames`.
      const constantsObj = rootObject["constants"];
      if (Array.isArray(constantsObj)) {
        this._constantNames = new Set<string>(constantsObj as string[]);
      }

      this._mainContentContainer = asOrThrows(
        JsonSerialisation.JTokenToRuntimeObject(rootToken),
        Container,
      );

      this.ResetState();
    }
    // ------
  }

  // Merge together `public string ToJson()` and `void ToJson(SimpleJson.Writer writer)`.
  // Will only return a value if writer was not provided.
  public ToJson(
    writer?: SimpleJson.Writer,
    // Optional per-flow memo for incremental serialization. Applies to the
    // story's top-level named flows only; listDefs/structDefs/inline content are
    // always serialized fresh. See JsonSerialisation.WriteRuntimeContainer.
    flowMemo?: {
      resolve: (
        name: string,
        container: Container,
        serialize: () => any,
      ) => any;
    },
  ): string | void {
    let shouldReturn = false;

    if (!writer) {
      shouldReturn = true;
      writer = new SimpleJson.Writer();
    }

    writer.WriteObjectStart();

    writer.WriteIntProperty("inkVersion", Story.inkVersionCurrent);

    writer.WriteProperty("root", (w) =>
      JsonSerialisation.WriteRuntimeContainer(
        w,
        this._mainContentContainer,
        false,
        this.onWriteRuntimeObject,
        flowMemo,
      ),
    );

    if (this._listDefinitions != null) {
      writer.WritePropertyStart("listDefs");
      writer.WriteObjectStart();

      for (let def of this._listDefinitions.lists) {
        writer.WritePropertyStart(def.name);
        writer.WriteObjectStart();

        for (let [key, value] of def.items) {
          let item = InkListItem.fromSerializedKey(key);
          let val = value;
          writer.WriteIntProperty(item.itemName, val);
        }

        writer.WriteObjectEnd();
        writer.WritePropertyEnd();
      }

      writer.WriteObjectEnd();
      writer.WritePropertyEnd();
    }

    // Names declared with `const`. Shipped so the runtime can keep them
    // read-only and out of save data while still exposing them as ordinary
    // inspectable globals — see `VariablesState.constantNames`.
    if (this._constantNames.size > 0) {
      writer.InjectObject("constants", [...this._constantNames]);
    }

    if (
      this._structDefinitions != null &&
      Object.keys(this._structDefinitions).length > 0
    ) {
      writer.InjectObject("structDefs", this._structDefinitions);
    }

    writer.WriteObjectEnd();

    if (shouldReturn) return writer.toString();
  }

  /** Builds a fresh state and initializes the globals, unless
   *  `initializeGlobals` is false, which leaves them to the caller: the binary
   *  program's engine runs its own declaration sequence against this story's
   *  globals (see `ProgramStory`). */
  public ResetState(initializeGlobals = true) {
    this.IfAsyncWeCant("ResetState");

    // Reactive dependency tracking is an OBSERVATION MODE, not story state:
    // resetting the state must not silently disable it. The fresh
    // `VariablesState` below defaults the flag off, and the runtime that
    // enabled it (the reactive UI's layout mount) has no hook into every
    // reset path — `Game.rewindStory`, `jumpToPath`, and any future caller
    // each mint a fresh state, and every one that forgot to re-assert the
    // flag froze the mounted `{bindings}` for the whole run (#365: the
    // handler ran, the VM changed, and no change was ever recorded for the
    // refresh to react to). Carry the mode across; the accumulated
    // change-sets deliberately start empty — the globals re-declare below,
    // recording fresh changes as they go.
    const reactiveDepsEnabled =
      this._state?.variablesState?.reactiveDepsEnabled ?? false;

    this._state = new StoryState(this);
    this._state.variablesState.reactiveDepsEnabled = reactiveDepsEnabled;
    this._state.variablesState.ObserveVariableChange(
      this.VariableStateDidChangeEvent.bind(this),
    );

    if (initializeGlobals) {
      this.ResetGlobals();
    } else {
      this.state.variablesState.constantNames = this._constantNames;
    }

    // Last, so that the work `ResetGlobals` itself does through the ordinary
    // running paths (it diverts to `global decl` and continues) does not clear
    // the mark it is here to set.
    this._stateIsPristine = true;
  }

  public ResetErrors() {
    if (this._state === null) {
      return throwNullException("this._state");
    }
    this._state.ResetErrors();
  }

  public ResetCallstack() {
    this.IfAsyncWeCant("ResetCallstack");
    if (this._state === null) {
      return throwNullException("this._state");
    }
    this._stateIsPristine = false;
    this._state.ForceEnd();
  }

  public ResetGlobals() {
    // Re-published on every reset so a reloaded//swapped story can't leave the
    // previous program's constant set behind.
    this.state.variablesState.constantNames = this._constantNames;
    if (this._mainContentContainer.namedContent.get("global decl")) {
      let originalPointer = this.state.currentPointer.copy();

      this.ChoosePath(new Path("global decl"), false);

      this.ContinueInternal();

      this.state.currentPointer = originalPointer;
    }

    this.state.variablesState.SnapshotDefaultGlobals();
  }

  public SwitchFlow(flowName: string) {
    this.IfAsyncWeCant("switch flow");

    this._stateIsPristine = false;
    this.state.SwitchFlow_Internal(flowName);
  }

  public RemoveFlow(flowName: string) {
    this._stateIsPristine = false;
    this.state.RemoveFlow_Internal(flowName);
  }

  public SwitchToDefaultFlow() {
    this._stateIsPristine = false;
    this.state.SwitchToDefaultFlow_Internal();
  }

  public Continue() {
    if (!this._hasValidatedExternals) this.ValidateExternalBindings();

    this.ContinueInternal();
    return this.currentText;
  }

  get canContinue() {
    return this.state.canContinue;
  }

  get asyncContinueComplete() {
    return !this._asyncContinueActive;
  }

  /** Advance the story a single step and leave it in an asynchronous
   *  continue, so the caller decides when the story moves again.
   *  {@link Continue} runs to the end of the current line instead. */
  public ContinueAsync() {
    if (!this._hasValidatedExternals) this.ValidateExternalBindings();

    this.ContinueInternal(true);
  }

  /** Close an in-progress `ContinueAsync` WITHOUT advancing the story, for a
   *  caller that is about to replace the story state outright.
   *
   *  `ResetState`, `ChoosePathString` and the rest refuse to run while a line
   *  is still part-way through (`IfAsyncWeCant`), and until now the only way
   *  past that was a plain `Continue()` — which finishes the line by running
   *  it. That work is wasted whenever the caller is about to discard the state
   *  anyway, and worse, it cannot be declined: a story sitting in a loop that
   *  never completes a line runs forever, with no error raised and nothing to
   *  stop it (#386).
   *
   *  So this ends the continue instead of finishing it. Everything below is
   *  the wrap-up `ContinueInternal` performs when a line is over, minus the
   *  advancing: the open batch of variable observations is closed out.
   *
   *  Closing that batch ANNOUNCES what it recorded: `CompleteVariableObservation`
   *  raises `variableChangedEvent` for every variable the abandoned run touched
   *  before it was stopped. An observer registered through `ObserveVariable`
   *  therefore sees a PART-WAY-THROUGH view — the writes the line had reached,
   *  not the ones it would have finished with — followed by whatever the
   *  caller's replacement re-declares. The `Continue()` this replaces announced
   *  a different thing, the values as of the completed line, so this is a real
   *  difference and not a parity claim. It is stated rather than papered over
   *  because both are announcements of a run that is about to be discarded, and
   *  choosing what an observer should see across an abandoned line is a
   *  decision about observer semantics rather than part of ending the continue.
   *  Nothing in this repository subscribes today.
   *
   *  One deliberate divergence from that wrap-up: it completes the observation
   *  batch only at `_recursiveContinueCount == 1`, and this does it
   *  unconditionally, because a cancel runs from outside any `ContinueInternal`
   *  frame — where that count is zero and the guard would never let the batch
   *  close. The guard below enforces that this is the only way it is used. */
  public CancelAsyncContinue() {
    // Cancelling from inside a live continue would be the original bug wearing
    // a new hat: clearing the flag while `ContinueInternal`'s loop is still on
    // the stack disables the break that ends its slice, so the loop would run
    // the line to its end — and a line that never ends never would. Refuse,
    // the same way the runtime refuses every other operation that is unsafe
    // mid-continue.
    if (this._recursiveContinueCount > 0) {
      throw new Error(
        "Can't CancelAsyncContinue from inside a Continue. Only a caller that " +
          "is about to replace the story state may cancel, and it must do so " +
          "between continues.",
      );
    }

    if (!this._asyncContinueActive) {
      return;
    }

    this._state.didSafeExit = false;
    this._state.variablesState.CompleteVariableObservation();

    this._asyncContinueActive = false;
  }

  /** `stepAtATime` advances a single step and stays in an asynchronous
   *  continue; otherwise the story runs to the end of the current line. */
  public ContinueInternal(stepAtATime = false) {
    this._stateIsPristine = false;
    if (this._profiler != null) this._profiler.PreContinue();

    this._recursiveContinueCount++;

    if (!this._asyncContinueActive) {
      this._asyncContinueActive = stepAtATime;

      if (!this.canContinue) {
        throw new Error(
          "Can't continue - should check canContinue before calling Continue",
        );
      }

      this._state.didSafeExit = false;
      // The step the last continue cut off after its line ended starts this
      // one: its output, whether that output's own line still waits for its
      // newline, and the paths it ran, which belong to the beat that shows it.
      const carried = this._state.TakeCarriedStep();
      this._state.ResetOutput(carried?.output ?? null);
      this._state.lineEndPending = carried?.lineEndPending ?? false;
      this._state.outputCut = null;
      this._state.heldPaths = [];

      if (this._recursiveContinueCount == 1)
        this._state.variablesState.StartVariableObservation();

      if (carried && this.onExecute !== null) {
        for (const path of carried.paths) this.onExecute(path);
      }
    } else if (this._asyncContinueActive && !stepAtATime) {
      this._asyncContinueActive = false;
    }

    // Carried output that ends its line is a line already written, and this
    // continue returns it without stepping.
    let outputStreamEndsInNewline =
      !this._state.inStringEvaluation && this._state.outputStreamEndsInNewline;
    while (!outputStreamEndsInNewline && this.canContinue) {
      try {
        outputStreamEndsInNewline = this.ContinueSingleStep();
      } catch (e) {
        if (!(e instanceof StoryException)) {
          // An engine error leaves this continue for good, so it stops
          // counting as live. A continue still counted after it has left would
          // make `CancelAsyncContinue` refuse for the rest of the story's life,
          // and with it every reset, jump and load (#473). A line an
          // asynchronous continue had open stays open for the caller to cancel.
          this._recursiveContinueCount--;
          throw e;
        }

        this.AddError(e.message, undefined, e.useEndLineNumber, e.raisedPath);
        break;
      }

      // An asynchronous continue advances one step per call, so the caller
      // decides when the story moves again.
      if (this._asyncContinueActive) {
        break;
      }
    }

    this._state.CarryOutputPastCut();

    if (outputStreamEndsInNewline || !this.canContinue) {
      // Paths held while a line end waited, with no cut to carry them to the
      // next continue, ran for this one.
      for (const path of this._state.ReleaseHeldPaths()) {
        if (this.onExecute !== null) this.onExecute(path);
      }

      if (!this.canContinue) {
        if (this.state.callStack.canPopThread)
          this.AddError(
            "Thread available to pop, threads should always be flat by the end of evaluation?",
          );

        if (
          this.state.generatedChoices.length == 0 &&
          !this.state.didSafeExit &&
          this._temporaryEvaluationContainer == null
        ) {
          if (this.state.callStack.CanPop(PushPopType.Tunnel))
            this.AddError(
              "unexpectedly reached end of content. Do you need a '->->' to return from a tunnel?",
            );
          else if (this.state.callStack.CanPop(PushPopType.Function))
            this.AddError(
              "unexpectedly reached end of content. Do you need a '~ return'?",
            );
          else if (!this.state.callStack.canPop)
            this.AddError(
              "ran out of content. Do you need a '-> DONE' or '-> END'?",
            );
          else
            this.AddError(
              "unexpectedly reached end of content for unknown reason. Please debug compiler!",
            );
        }
      }

      this.state.didSafeExit = false;

      if (this._recursiveContinueCount == 1)
        this._state.variablesState.CompleteVariableObservation();

      this._asyncContinueActive = false;
      if (this.onDidContinue !== null) this.onDidContinue();
    }

    this._recursiveContinueCount--;

    if (this._profiler != null) this._profiler.PostContinue();

    // In the following code, we're masking a lot of non-null assertion,
    // because testing for against `hasError` or `hasWarning` makes sure
    // the arrays are present and contain at least one element.
    if (this.state.hasError || this.state.hasWarning) {
      if (this.onError !== null) {
        if (this.state.hasError) {
          const raised = this.state.raisedErrors;
          this.state.currentErrors!.forEach((err, i) => {
            this.onError!(err, ErrorType.Error, null, raised[i] ?? null);
          });
        }
        if (this.state.hasWarning) {
          const raised = this.state.raisedWarnings;
          this.state.currentWarnings!.forEach((err, i) => {
            this.onError!(err, ErrorType.Warning, null, raised[i] ?? null);
          });
        }
        this.ResetErrors();
      } else {
        let sb = new StringBuilder();
        sb.Append("Ink had ");
        if (this.state.hasError) {
          sb.Append(`${this.state.currentErrors!.length}`);
          sb.Append(
            this.state.currentErrors!.length == 1 ? " error" : " errors",
          );
          if (this.state.hasWarning) sb.Append(" and ");
        }
        if (this.state.hasWarning) {
          sb.Append(`${this.state.currentWarnings!.length}`);
          sb.Append(
            this.state.currentWarnings!.length == 1 ? " warning" : " warnings",
          );
          if (this.state.hasWarning) sb.Append(" and ");
        }
        sb.Append(
          ". It is strongly suggested that you assign an error handler to story.onError. The first issue was: ",
        );
        sb.Append(
          this.state.hasError
            ? this.state.currentErrors![0]!
            : this.state.currentWarnings![0]!,
        );

        throw new StoryException(sb.toString());
      }
    }
    // Automatically force a choice (used when simulating routes)
    if (this.simulator) {
      const currentChoices = this._state.currentChoices;
      if (!this.canContinue && currentChoices.length > 0) {
        const sitePath = this.state.previousPointer.path?.toString();
        if (sitePath) {
          const forcedSourcePath = this.simulator.forceChoice(sitePath);
          const forced = currentChoices.find(
            (choice) => choice.sourcePath === forcedSourcePath,
          );
          if (forced != null) {
            this.ChooseChoice(forced);
          }
        }
      }
    }
  }

  // Runs one step, and returns true when the step ended this continue's line.
  public ContinueSingleStep() {
    if (this._profiler != null) this._profiler.PreStep();

    this.Step();

    if (this._profiler != null) this._profiler.PostStep();

    // A step that showed something while a line end was pending cut the
    // output there: the continue ends with that line, and what the step
    // showed after the cut belongs to the next one. Where the story cannot go
    // on, no next continue follows to carry it to, and it stays in this one
    // after the line's newline.
    if (this.state.outputCut !== null) {
      if (this.canContinue) return true;
      this.state.CloseOutputCut();
    }

    if (!this.canContinue && !this.state.callStack.elementIsEvaluateFromGame) {
      this.TryFollowDefaultInvisibleChoice();
    }

    // A newline ends the line, so the continue returns at it. Inside a string
    // evaluation a newline is a character of the value being built.
    return (
      !this.state.inStringEvaluation && this.state.outputStreamEndsInNewline
    );
  }

  public ContinueMaximally() {
    this.IfAsyncWeCant("ContinueMaximally");

    let sb = new StringBuilder();

    while (this.canContinue) {
      sb.Append(this.Continue());
    }

    return sb.toString();
  }

  public ContentAtPath(path: Path) {
    return this.mainContentContainer.ContentAtPath(path);
  }

  public KnotContainerWithName(name: string) {
    let namedContainer = this.mainContentContainer.namedContent.get(name);
    if (namedContainer instanceof Container) return namedContainer;
    else return null;
  }

  /** The stack trace `debug.traceback` prints: each call frame of each
   *  thread, from the outermost, with the path of the container it is in. */
  public CallStackTrace(): string {
    return this.state.callStack.callStackTrace;
  }

  /** How many call frames the current thread has, for `debug.info`. */
  public CallFrameCount(): number {
    return this.state.callStack.elements.length;
  }

  /** The path of the container call frame `index` of the current thread is
   *  in, counting from the outermost, as `debug.info` names a frame, or null
   *  for a frame with no position. */
  public CallFramePath(index: number): string | null {
    const ptr = this.state.callStack.elements[index]?.currentPointer;
    const container = ptr && !ptr.isNull ? ptr.container : null;
    return container?.path?.toString() ?? null;
  }

  /** The value a read of `name` gives when no variable has that name but a
   *  knot or function does: a divert target to it, or null. */
  public FlowValueNamed(name: string): DivertTargetValue | null {
    const knotContainer = this.KnotContainerWithName(name);
    return knotContainer && knotContainer.path
      ? new DivertTargetValue(knotContainer.path)
      : null;
  }

  /** The function a function value names for the shared call handlers: the
   *  container a divert target's path leads to, or null for any other
   *  value. */
  public FunctionTargetOf(value: unknown): FunctionTarget | null {
    if (value instanceof DivertTargetValue && value.value !== null) {
      return new ContainerTarget(
        this.ContentAtPath(value.value).obj,
        value.value,
      );
    }
    return null;
  }

  /** Enters `target`, a function the shared call handlers found
   *  (`FunctionTargetOf`), in a new function frame. */
  public EnterFunction(target: FunctionTarget): void {
    this.state.divertedPointer = this.PointerAtPath(
      (target as ContainerTarget).path!,
    );
    this.state.callStack.Push(
      PushPopType.Function,
      undefined,
      this.state.outputStream.length,
    );
  }

  public PointerAtPath(path: Path) {
    if (path.length == 0) return Pointer.Null;

    let p = new Pointer();

    let pathLengthToUse = path.length;

    let result = null;
    if (path.lastComponent === null) {
      return throwNullException("path.lastComponent");
    }

    if (path.lastComponent.isIndex) {
      pathLengthToUse = path.length - 1;
      result = this.mainContentContainer.ContentAtPath(
        path,
        undefined,
        pathLengthToUse,
      );
      p.container = result.container;
      p.index = path.lastComponent.index;
      if (p.index != null && p.index < 0 && result.container) {
        // Negative indexes represent the distance from the end of the container
        const index = result.container.content.length + p.index;
        if (index >= 0) {
          p.index = index;
        } else {
          p.index = 0;
        }
      }
    } else {
      result = this.mainContentContainer.ContentAtPath(path);
      p.container = result.container;
      p.index = null;
    }

    if (
      result.obj == null ||
      (result.obj == this.mainContentContainer && pathLengthToUse > 0)
    ) {
      this.Error(
        "Failed to find content at path '" +
          path +
          "', and no approximation of it was possible.",
      );
    } else if (result.approximate)
      this.Warning(
        "Failed to find content at path '" +
          path +
          "', so it was approximated to: '" +
          result.obj.path +
          "'.",
      );

    return p;
  }

  public Step() {
    this.stepCount++;
    if (this.stepLimit !== null && this.stepCount > this.stepLimit) {
      throw new StepLimitExceeded();
    }
    if ((this.stepCount & (EXECUTION_WATCH_STEPS - 1)) === 0) {
      executionWatch.listener?.(this);
    }
    this.pausedBeforeCondition = null; // clear any previous pause

    let shouldAddToStream = true;

    let pointer = this.state.currentPointer.copy();
    if (pointer.isNull) {
      return;
    }

    // Container containerToEnter = pointer.Resolve () as Container;
    let containerToEnter = asOrNull(pointer.Resolve(), Container);

    while (containerToEnter) {
      this.VisitContainer(containerToEnter, true);

      // No content? the most we can do is step past it
      if (containerToEnter.content.length == 0) {
        break;
      }

      pointer = Pointer.StartOf(containerToEnter);
      // containerToEnter = pointer.Resolve() as Container;
      containerToEnter = asOrNull(pointer.Resolve(), Container);
    }

    this.state.currentPointer = pointer.copy();

    if (this._profiler != null) this._profiler.Step(this.state.callStack);

    // Is the current content object:
    //  - Normal content
    //  - Or a logic/flow statement - if so, do it
    // Stop flow if we hit a stack pop when we're unable to pop (e.g. return/done statement in knot
    // that was diverted to rather than called as a function)
    let currentContentObj = pointer.Resolve();

    // When simulating routes, we pause before evaluating conditions so we can force their result
    if (this.pauseBeforeEvaluatingConditions) {
      // Conditional divert?
      const divert = asOrNull(currentContentObj, Divert);
      if (divert && divert.isConditional) {
        const sitePath = this.state.previousPointer.path?.toString();
        if (sitePath) {
          this.pausedBeforeCondition = sitePath;
          return; // do NOT consume; do NOT advance
        }
      }

      // Conditional choice?
      const choicePoint = asOrNull(currentContentObj, ChoicePoint);
      if (choicePoint && choicePoint.hasCondition) {
        const sitePath = this.state.previousPointer.path?.toString();
        if (sitePath) {
          this.pausedBeforeCondition = sitePath;
          return; // do NOT consume; do NOT advance
        }
      }
    }

    let isLogicOrFlowControl =
      this.PerformLogicAndFlowControl(currentContentObj);

    // Has flow been forced to end by flow control above?
    if (this.state.currentPointer.isNull) {
      return;
    }

    if (isLogicOrFlowControl) {
      shouldAddToStream = false;
    }

    // Choice with condition?
    // var choicePoint = currentContentObj as ChoicePoint;
    let choicePoint = asOrNull(currentContentObj, ChoicePoint);
    if (choicePoint) {
      let choice = this.ProcessChoice(choicePoint);
      if (choice) {
        this.state.generatedChoices.push(choice);
      }

      currentContentObj = null;
      shouldAddToStream = false;
    }

    // If the container has no content, then it will be
    // the "content" itself, but we skip over it.
    if (currentContentObj instanceof Container) {
      shouldAddToStream = false;
    }

    // Content to add to evaluation stack or the output stream
    if (shouldAddToStream) {
      // If we're pushing a variable pointer onto the evaluation stack, ensure that it's specific
      // to our current (possibly temporary) context index. And make a copy of the pointer
      // so that we're not editing the original runtime object.
      // var varPointer = currentContentObj as VariablePointerValue;
      let varPointer = asOrNull(currentContentObj, VariablePointerValue);
      if (varPointer && varPointer.contextIndex == -1) {
        currentContentObj = openVariablePointer(
          this.state.callStack,
          varPointer.variableName,
        );
      }

      // Expression evaluation content
      if (this.state.inExpressionEvaluation) {
        this.state.PushEvaluationStack(currentContentObj);
      }
      // Output stream content (i.e. not expression evaluation)
      else {
        this.state.PushToOutputStream(currentContentObj);
      }
    }

    // Increment the content pointer, following diverts if necessary
    this.NextContent();

    // Starting a thread should be done after the increment to the content pointer,
    // so that when returning from the thread, it returns to the content after this instruction.
    // var controlCmd = currentContentObj as ;
    let controlCmd = asOrNull(currentContentObj, ControlCommand);
    if (
      controlCmd &&
      controlCmd.commandType == ControlCommand.CommandType.StartThread
    ) {
      this.state.callStack.PushThread();
    }
  }

  public VisitContainer(container: Container, atStart: boolean) {
    if (!container.countingAtStartOnly || atStart) {
      if (container.visitsShouldBeCounted)
        this.state.IncrementVisitCountForContainer(container);

      if (container.turnIndexShouldBeCounted)
        this.state.RecordTurnIndexVisitToContainer(container);
    }
  }

  private _prevContainers: Container[] = [];
  public VisitChangedContainersDueToDivert() {
    let previousPointer = this.state.previousPointer.copy();
    let pointer = this.state.currentPointer.copy();

    if (pointer.isNull || pointer.index == null) return;

    this._prevContainers.length = 0;
    if (!previousPointer.isNull) {
      // Container prevAncestor = previousPointer.Resolve() as Container ?? previousPointer.container as Container;
      let resolvedPreviousAncestor = previousPointer.Resolve();
      let prevAncestor =
        asOrNull(resolvedPreviousAncestor, Container) ||
        asOrNull(previousPointer.container, Container);
      while (prevAncestor) {
        this._prevContainers.push(prevAncestor);
        // prevAncestor = prevAncestor.parent as Container;
        prevAncestor = asOrNull(prevAncestor.parent, Container);
      }
    }

    let currentChildOfContainer = pointer.Resolve();

    if (currentChildOfContainer == null) return;

    // Container currentContainerAncestor = currentChildOfContainer.parent as Container;
    let currentContainerAncestor = asOrNull(
      currentChildOfContainer.parent,
      Container,
    );
    let allChildrenEnteredAtStart = true;
    while (
      currentContainerAncestor &&
      (this._prevContainers.indexOf(currentContainerAncestor) < 0 ||
        currentContainerAncestor.countingAtStartOnly)
    ) {
      // Check whether this ancestor container is being entered at the start,
      // by checking whether the child object is the first.
      let enteringAtStart =
        currentContainerAncestor.content.length > 0 &&
        currentChildOfContainer == currentContainerAncestor.content[0] &&
        allChildrenEnteredAtStart;

      if (!enteringAtStart) allChildrenEnteredAtStart = false;

      // Mark a visit to this container
      this.VisitContainer(currentContainerAncestor, enteringAtStart);

      currentChildOfContainer = currentContainerAncestor;
      // currentContainerAncestor = currentContainerAncestor.parent as Container;
      currentContainerAncestor = asOrNull(
        currentContainerAncestor.parent,
        Container,
      );
    }
  }

  public PopChoiceStringAndTags(tags: string[]) {
    let choiceOnlyStrVal = asOrThrows(
      this.state.PopEvaluationStack(),
      StringValue,
    );

    while (
      this.state.evaluationStack.length > 0 &&
      asOrNull(this.state.PeekEvaluationStack(), Tag) != null
    ) {
      let tag = asOrNull(this.state.PopEvaluationStack(), Tag);
      if (tag) tags.push(tag.text);
    }
    return choiceOnlyStrVal.value;
  }

  public ProcessChoice(choicePoint: ChoicePoint) {
    let showChoice = true;

    // Don't create choice if choice point doesn't pass conditional
    if (choicePoint.hasCondition) {
      // If a simulator is installed, let it force the boolean (true=visible, false=hidden)
      if (this.simulator) {
        const sitePath = this.state.previousPointer.path?.toString();
        if (sitePath) {
          const forced = this.simulator.forceCondition(sitePath);
          // A null verdict means the route says nothing about this site, so
          // the evaluated value stands.
          if (forced != null) {
            // inject forced verdict as an int (ink booleans are ints)
            this.state.PopEvaluationStack();
            this.state.PushEvaluationStack(new IntValue(forced ? 1 : 0));
          }
        }
      }

      let conditionValue = this.state.PopEvaluationStack();

      if (this.onEvaluateCondition)
        this.onEvaluateCondition(this.IsTruthy(conditionValue));

      if (!this.IsTruthy(conditionValue)) {
        showChoice = false;
      }
    }

    let startText = "";
    let choiceOnlyText = "";
    let tags: string[] = [];

    if (choicePoint.hasChoiceOnlyContent) {
      choiceOnlyText = this.PopChoiceStringAndTags(tags) || "";
    }

    if (choicePoint.hasStartContent) {
      startText = this.PopChoiceStringAndTags(tags) || "";
    }

    // Don't create choice if player has already read this content
    if (choicePoint.onceOnly) {
      let visitCount = this.state.VisitCountForContainer(
        choicePoint.choiceTarget,
      );
      if (visitCount > 0) {
        showChoice = false;
      }
    }

    // We go through the full process of creating the choice above so
    // that we consume the content for it, since otherwise it'll
    // be shown on the output stream.
    if (!showChoice) {
      return null;
    }

    let choice = new Choice();
    choice.targetPath = choicePoint.pathOnChoice;
    choice.sourcePath = choicePoint.path.toString();
    choice.isInvisibleDefault = choicePoint.isInvisibleDefault;
    choice.threadAtGeneration = this.state.callStack.ForkThread();
    choice.tags = tags.reverse(); //C# is a stack
    choice.text = this.state.CleanOutputWhitespace(startText + choiceOnlyText);

    return choice;
  }

  public IsTruthy(obj: InkObject) {
    let truthy = false;
    if (obj instanceof Value) {
      let val = obj;

      if (val instanceof DivertTargetValue) {
        let divTarget = val;
        this.Error(
          "Shouldn't use a divert target (to " +
            divTarget.targetPath +
            ") as a conditional value. Did you intend a function call 'likeThis()' or a read count check 'likeThis'? (no arrows)",
        );
        return false;
      }

      return val.isTruthy;
    }
    return truthy;
  }

  public PerformLogicAndFlowControl(contentObj: InkObject | null) {
    if (contentObj == null) {
      return false;
    }

    // Divert
    if (contentObj instanceof Divert) {
      let currentDivert = contentObj;

      if (currentDivert.isConditional) {
        // If simulator provides a forced value, inject it onto the eval stack.
        if (this.simulator) {
          const sitePath = this.state.previousPointer.path?.toString();
          if (sitePath) {
            const forced = this.simulator.forceCondition(sitePath);
            // A null verdict means the route says nothing about this site (it
            // is past the route's end), so the evaluated value stands.
            if (forced != null) {
              // Inject as int (ink booleans are ints)
              this.state.PopEvaluationStack();
              this.state.PushEvaluationStack(new IntValue(forced ? 1 : 0));
            }
          }
        }

        let conditionValue = this.state.PopEvaluationStack();

        if (this.onEvaluateCondition)
          this.onEvaluateCondition(this.IsTruthy(conditionValue));

        // False conditional? Cancel divert
        if (!this.IsTruthy(conditionValue)) return true;
      }

      if (currentDivert.hasVariableTarget) {
        const target = callVariableTarget(
          this,
          currentDivert.variableDivertName,
        ) as ContainerTarget | null;
        if (target === null) {
          return true;
        }
        this.state.divertedPointer = this.PointerAtPath(target.path!);
      } else if (currentDivert.isExternal) {
        this.CallExternalFunction(
          currentDivert.targetPathString,
          currentDivert.externalArgs,
        );
        return true;
      } else if (currentDivert.targetPath == null) {
        // The compiler reported this target as not found; reaching it at
        // runtime is a story error rather than a crash.
        this.Error("Divert target not found.");
      } else {
        this.state.divertedPointer = currentDivert.targetPointer.copy();
        // Spread last-arg MultiValue for non-variadic static-dispatch
        // function calls. Detected via `pushesToStack` +
        // Function push-type — the same pair that marks a divert as
        // a Lua-style function call (vs a knot jump / tunnel).
        if (
          currentDivert.pushesToStack &&
          currentDivert.stackPushType === PushPopType.Function
        ) {
          spreadLastMultiIfNonVariadic(
            this,
            new ContainerTarget(currentDivert.targetPointer.container),
          );
        }
      }

      if (currentDivert.pushesToStack) {
        this.state.callStack.Push(
          currentDivert.stackPushType,
          undefined,
          this.state.outputStream.length,
        );
      }

      if (this.state.divertedPointer.isNull && !currentDivert.isExternal) {
        if (
          currentDivert &&
          currentDivert.debugMetadata &&
          currentDivert.debugMetadata.filePath != null
        ) {
          this.Error(
            "Divert target doesn't exist: " +
              currentDivert.debugMetadata.filePath,
          );
        } else {
          this.Error("Divert resolution failed: " + currentDivert);
        }
      }

      return true;
    }

    // Start/end an expression evaluation? Or print out the result?
    else if (contentObj instanceof ControlCommand) {
      let evalCommand = contentObj;

      switch (evalCommand.commandType) {
        case ControlCommand.CommandType.EvalStart:
          this.Assert(
            this.state.inExpressionEvaluation === false,
            "Already in expression evaluation?",
          );
          this.state.inExpressionEvaluation = true;
          break;

        case ControlCommand.CommandType.EvalEnd:
          this.Assert(
            this.state.inExpressionEvaluation === true,
            "Not in expression evaluation mode",
          );
          this.state.inExpressionEvaluation = false;
          break;

        case ControlCommand.CommandType.EvalOutput:
          // If the expression turned out to be empty, there may not be anything on the stack
          if (this.state.evaluationStack.length > 0) {
            let output = this.state.PopEvaluationStack();

            // Functions may evaluate to Void, in which case we skip output
            if (!(output instanceof Void)) {
              // TODO: Should we really always blanket convert to string?
              // It would be okay to have numbers in the output stream the
              // only problem is when exporting text for viewing, it skips over numbers etc.
              let text = new StringValue(output.toString());

              this.state.PushToOutputStream(text);
            }
          }
          break;

        case ControlCommand.CommandType.NoOp:
          break;

        case ControlCommand.CommandType.Duplicate:
          this.state.PushEvaluationStack(this.state.PeekEvaluationStack()!);
          break;

        case ControlCommand.CommandType.PopEvaluatedValue:
          this.state.PopEvaluationStack();
          break;

        case ControlCommand.CommandType.PopFunction:
        case ControlCommand.CommandType.PopTunnel:
          let popType =
            evalCommand.commandType == ControlCommand.CommandType.PopFunction
              ? PushPopType.Function
              : PushPopType.Tunnel;

          let overrideTunnelReturnTarget: DivertTargetValue | null = null;
          if (popType == PushPopType.Tunnel) {
            let popped = this.state.PopEvaluationStack();
            // overrideTunnelReturnTarget = popped as DivertTargetValue;
            overrideTunnelReturnTarget = asOrNull(popped, DivertTargetValue);
            if (overrideTunnelReturnTarget === null) {
              this.Assert(
                popped instanceof Void,
                "Expected void if ->-> doesn't override target",
              );
            }
          }

          if (this.state.TryExitFunctionEvaluationFromGame()) {
            break;
          } else if (
            this.state.callStack.currentElement!.type != popType ||
            !this.state.callStack.canPop
          ) {
            let names: Map<PushPopType, string> = new Map();
            names.set(
              PushPopType.Function,
              "function return statement (return)",
            );
            names.set(PushPopType.Tunnel, "tunnel onwards statement (->->)");

            let expected = names.get(this.state.callStack.currentElement!.type);
            if (!this.state.callStack.canPop) {
              expected = "end of flow (-> END or choice)";
            }

            let errorMsg =
              "Found " + names.get(popType) + ", when expected " + expected;

            this.Error(errorMsg);
          } else {
            this.state.PopCallStack();

            if (overrideTunnelReturnTarget)
              this.state.divertedPointer = this.PointerAtPath(
                overrideTunnelReturnTarget.targetPath,
              );
          }
          break;

        case ControlCommand.CommandType.BeginString:
          this.state.PushToOutputStream(evalCommand);

          this.Assert(
            this.state.inExpressionEvaluation === true,
            "Expected to be in an expression when evaluating a string",
          );
          this.state.inExpressionEvaluation = false;
          break;

        // Leave it to story.currentText and story.currentTags to sort out the text from the tags
        // This is mostly because we can't always rely on the existence of EndTag, and we don't want
        // to try and flatten dynamic tags to strings every time \n is pushed to output
        case ControlCommand.CommandType.BeginTag:
          this.state.PushToOutputStream(evalCommand);
          break;

        // EndTag has 2 modes:
        //  - When in string evaluation (for choices)
        //  - Normal
        //
        // The only way you could have an EndTag in the middle of
        // string evaluation is if we're currently generating text for a
        // choice, such as:
        //
        //   + choice # tag
        //
        // In the above case, the ink will be run twice:
        //  - First, to generate the choice text. String evaluation
        //    will be on, and the final string will be pushed to the
        //    evaluation stack, ready to be popped to make a Choice
        //    object.
        //  - Second, when ink generates text after choosing the choice.
        //    On this ocassion, it's not in string evaluation mode.
        //
        // On the writing side, we disallow manually putting tags within
        // strings like this:
        //
        //   {"hello # world"}
        //
        // So we know that the tag must be being generated as part of
        // choice content. Therefore, when the tag has been generated,
        // we push it onto the evaluation stack in the exact same way
        // as the string for the choice content.
        case ControlCommand.CommandType.EndTag: {
          if (this.state.inStringEvaluation) {
            let contentStackForTag: InkObject[] = [];
            let outputCountConsumed = 0;
            for (let i = this.state.outputStream.length - 1; i >= 0; --i) {
              let obj = this.state.outputStream[i];
              outputCountConsumed++;

              // var command = obj as ControlCommand;
              let command = asOrNull(obj, ControlCommand);
              if (command != null) {
                if (
                  command.commandType == ControlCommand.CommandType.BeginTag
                ) {
                  break;
                } else {
                  this.Error(
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
            this.state.PopFromOutputStream(outputCountConsumed);
            // Build string out of the content we collected
            let sb = new StringBuilder();
            for (let strVal of contentStackForTag.reverse()) {
              sb.Append(strVal.toString());
            }
            let choiceTag = new Tag(
              this.state.CleanOutputWhitespace(sb.toString()),
            );
            // Pushing to the evaluation stack means it gets picked up
            // when a Choice is generated from the next Choice Point.
            this.state.PushEvaluationStack(choiceTag);
          } else {
            // Otherwise! Simply push EndTag, so that in the output stream we
            // have a structure of: [BeginTag, "the tag content", EndTag]
            this.state.PushToOutputStream(evalCommand);
          }
          break;
        }

        case ControlCommand.CommandType.EndString: {
          const captured = captureString(this.state);
          // Return to expression evaluation (from content mode)
          this.state.inExpressionEvaluation = true;
          this.state.PushEvaluationStack(captured);
          break;
        }

        case ControlCommand.CommandType.BeginObject:
          // Marker pushed onto the eval stack — EndObject walks back to it,
          // collecting each (key, value) pair between, and assembles the
          // ObjectValue.
          this.state.PushEvaluationStack(evalCommand);
          break;

        case ControlCommand.CommandType.EndObject: {
          const stack = this.state.evaluationStack;
          let markerIdx = -1;
          for (let i = stack.length - 1; i >= 0; --i) {
            const obj = stack[i];
            const cmd = asOrNull(obj, ControlCommand);
            if (
              cmd &&
              cmd.commandType === ControlCommand.CommandType.BeginObject
            ) {
              markerIdx = i;
              break;
            }
          }
          if (markerIdx < 0) {
            throw new StoryException(
              "Expected BeginObject marker on evaluation stack",
            );
          }
          const between = stack.splice(markerIdx, stack.length - markerIdx);
          // between[0] is the BeginObject marker; the rest are alternating
          // key, value, key, value, ... pairs in push order.
          this.state.PushEvaluationStack(tableFromPairs(between, 1));
          break;
        }

        case ControlCommand.CommandType.IndexValue: {
          const indexKey = this.state.PopEvaluationStack();
          const indexBase = this.state.PopEvaluationStack();
          this.state.PushEvaluationStack(indexValue(this, indexBase, indexKey));
          break;
        }

        case ControlCommand.CommandType.StoreIndex: {
          // Pops value, key, container off the eval stack and mutates
          // container[key] = value in place.
          const storeValue = this.state.PopEvaluationStack();
          const storeKey = this.state.PopEvaluationStack();
          const storeBase = this.state.PopEvaluationStack();
          storeIndex(this, storeBase, storeKey, storeValue);
          break;
        }

        case ControlCommand.CommandType.CallValueAsFunction:
          callValueAsFunction(this, evalCommand._callValueArgCount ?? -1);
          break;

        case ControlCommand.CommandType.BeginScope:
          // Push a new innermost temporary-variable scope on the
          // current call-stack element. Sparkdown emits this at the
          // start of every block (`if`/`for`/`while`/`repeat`/`do`)
          // so `local x` declarations follow Luau's block scoping —
          // an inner `local x` shadows an outer `x` for the rest of
          // the inner block, then the outer is visible again after
          // the matching `EndScope`.
          this.state.callStack.currentElement!.PushScope();
          break;

        case ControlCommand.CommandType.EndScope:
          // Pop the innermost temporary-variable scope. Refuses to
          // pop the outermost (function-level) frame, which would
          // leave the call-stack element with no scope frames at
          // all and break subsequent temp-var lookups.
          this.state.callStack.currentElement!.PopScope();
          break;

        case ControlCommand.CommandType.TurnsSince:
        case ControlCommand.CommandType.ReadCount:
          let target = this.state.PopEvaluationStack();
          if (!(target instanceof DivertTargetValue)) {
            let extraNote = "";
            if (target instanceof IntValue)
              extraNote =
                ". Did you accidentally pass a read count ('knot_name') instead of a target ('-> knot_name')?";
            this.Error(
              "TURNS_SINCE / READ_COUNT expected a divert target (knot, stitch, label name), but saw " +
                target +
                extraNote,
            );
            break;
          }

          // var divertTarget = target as DivertTargetValue;
          let divertTarget = asOrThrows(target, DivertTargetValue);
          // var container = ContentAtPath (divertTarget.targetPath).correctObj as Container;
          let container = asOrNull(
            this.ContentAtPath(divertTarget.targetPath).correctObj,
            Container,
          );

          let eitherCount;
          if (container != null) {
            if (
              evalCommand.commandType == ControlCommand.CommandType.TurnsSince
            )
              eitherCount = this.state.TurnsSinceForContainer(container);
            else eitherCount = this.state.VisitCountForContainer(container);
          } else {
            if (
              evalCommand.commandType == ControlCommand.CommandType.TurnsSince
            )
              eitherCount = -1;
            else eitherCount = 0;

            this.Warning(
              "Failed to find container for " +
                evalCommand.toString() +
                " lookup at " +
                divertTarget.targetPath.toString(),
            );
          }

          this.state.PushEvaluationStack(new IntValue(eitherCount));
          break;

        case ControlCommand.CommandType.VisitIndex:
          let count =
            this.state.VisitCountForContainer(
              this.state.currentPointer.container,
            ) - 1; // index not count
          this.state.PushEvaluationStack(new IntValue(count));
          break;

        case ControlCommand.CommandType.HoldForChoices: {
          // The block's own choices are the pending ones whose choice point
          // lies inside the block's container, however the run entered the
          // block. Choices generated elsewhere (before the block, or by a
          // thread started in it) are not the block's.
          let blockContainer = this.state.currentPointer.container;
          for (let i = 0; i < evalCommand._holdLevels; i++) {
            const parent = asOrNull(blockContainer?.parent ?? null, Container);
            if (parent === null) break;
            blockContainer = parent;
          }
          const block = blockContainer?.path.toString() ?? "";
          const offered = this.state.generatedChoices.some(
            (choice) =>
              block === "" ||
              choice.sourcePath === block ||
              choice.sourcePath.startsWith(block + "."),
          );
          if (offered) {
            this.StopFlowInThread();
          }
          break;
        }

        case ControlCommand.CommandType.SequenceShuffleIndex:
          let shuffleIndex = this.NextSequenceShuffleIndex();
          this.state.PushEvaluationStack(new IntValue(shuffleIndex!));
          break;

        case ControlCommand.CommandType.StartThread:
          // Handled in main step function
          break;

        case ControlCommand.CommandType.Done:
          this.StopFlowInThread();
          break;

        // Force flow to end completely
        case ControlCommand.CommandType.End:
          this.state.ForceEnd();
          break;

        case ControlCommand.CommandType.ListFromInt:
          // var intVal = state.PopEvaluationStack () as IntValue;
          let intVal = asOrNull(this.state.PopEvaluationStack(), IntValue);
          // var listNameVal = state.PopEvaluationStack () as StringValue;
          let listNameVal = asOrThrows(
            this.state.PopEvaluationStack(),
            StringValue,
          );

          if (intVal === null) {
            throw new StoryException(
              "Passed non-integer when creating a list element from a numerical value.",
            );
          }

          let generatedListValue = null;

          if (this.listDefinitions === null) {
            return throwNullException("this.listDefinitions");
          }
          let foundListDef = this.listDefinitions.TryListGetDefinition(
            listNameVal.value,
            null,
          );
          if (foundListDef.exists) {
            // Originally a primitive type, but here, can be null.
            // TODO: Replace by default value?
            if (intVal.value === null) {
              return throwNullException("minInt.value");
            }

            let foundItem = foundListDef.result!.TryGetItemWithValue(
              intVal.value,
              InkListItem.Null,
            );
            if (foundItem.exists) {
              generatedListValue = new ListValue(
                foundItem.result!,
                intVal.value,
              );
            }
          } else {
            throw new StoryException(
              "Failed to find list called " + listNameVal.value,
            );
          }

          if (generatedListValue == null) generatedListValue = new ListValue();

          this.state.PushEvaluationStack(generatedListValue);
          break;

        case ControlCommand.CommandType.ListRange:
          let max = asOrNull(this.state.PopEvaluationStack(), Value);
          let min = asOrNull(this.state.PopEvaluationStack(), Value);

          // var targetList = state.PopEvaluationStack () as ListValue;
          let targetList = asOrNull(this.state.PopEvaluationStack(), ListValue);

          if (targetList === null || min === null || max === null)
            throw new StoryException(
              "Expected list, minimum and maximum for LIST_RANGE",
            );

          if (targetList.value === null) {
            return throwNullException("targetList.value");
          }
          let result = targetList.value.ListWithSubRange(
            min.valueObject,
            max.valueObject,
          );

          this.state.PushEvaluationStack(new ListValue(result));
          break;

        case ControlCommand.CommandType.ListRandom: {
          let listVal = this.state.PopEvaluationStack() as ListValue;
          if (listVal === null)
            throw new StoryException("Expected list for LIST_RANDOM");

          let list = listVal.value;

          let newList: InkList | null = null;

          if (list === null) {
            throw throwNullException("list");
          }
          if (list.Count == 0) {
            newList = new InkList();
          } else {
            // Generate a random index for the element to take
            let resultSeed = this.state.storySeed + this.state.previousRandom;
            let random = new PRNG(resultSeed);

            let nextRandom = random.next();
            let listItemIndex = nextRandom % list.Count;

            // This bit is a little different from the original
            // C# code, since iterators do not work in the same way.
            // First, we iterate listItemIndex - 1 times, calling next().
            // The listItemIndex-th time is made outside of the loop,
            // in order to retrieve the value.
            let listEnumerator = list.entries();
            for (let i = 0; i <= listItemIndex - 1; i++) {
              listEnumerator.next();
            }
            let value = listEnumerator.next().value!;
            let randomItem: KeyValuePair<InkListItem, number> = {
              Key: InkListItem.fromSerializedKey(value[0]),
              Value: value[1],
            };

            // Origin list is simply the origin of the one element
            if (randomItem.Key.originName === null) {
              return throwNullException("randomItem.Key.originName");
            }
            newList = new InkList(randomItem.Key.originName, this);
            newList.Add(randomItem.Key, randomItem.Value);

            this.state.previousRandom = nextRandom;
          }

          this.state.PushEvaluationStack(new ListValue(newList));
          break;
        }

        case ControlCommand.CommandType.PackTuple: {
          packTuple(this, evalCommand._tupleArity);
          break;
        }

        case ControlCommand.CommandType.UnpackTuple: {
          unpackTuple(this, evalCommand._tupleArity);
          break;
        }

        case ControlCommand.CommandType.ShortCircuit: {
          // Conditional content-pointer jumps, shared by Lua's
          // short-circuiting `and`/`or` and the `if-then-else`
          // EXPRESSION form. Ops:
          //   - "jump": unconditional skip (no stack interaction) —
          //     emitted after a ternary's then-container to hop over
          //     the else-container.
          //   - "if": pop the condition; falsy skips (over the
          //     then-container + its trailing jump).
          //   - "and"/"or": peek the LHS; if it alone decides the
          //     expression (falsy for `and`, truthy for `or`), leave
          //     it as the result and skip the RHS container,
          //     otherwise pop it so the RHS produces the value.
          // In every case "skip N" means `index += N` here plus
          // Step's tail-end NextContent advancing one further,
          // landing just past N content elements.
          const scOp = evalCommand._shortCircuitOp;
          const jump = () => {
            const p = this.state.currentPointer.copy();
            p.index = (p.index ?? 0) + evalCommand._shortCircuitSkipCount;
            this.state.currentPointer = p;
          };
          if (scOp === "jump") {
            jump();
            break;
          }
          if (scOp === "if") {
            if (!popLuauCondition(this)) {
              jump();
            }
            break;
          }
          if (shortCircuitDecides(this, scOp as "and" | "or")) {
            jump();
          }
          break;
        }

        case ControlCommand.CommandType.RunStdLibFunction: {
          // Generic dispatcher for state-aware Luau builtins. Reads
          // the function name + arity off the ControlCommand instance
          // (set at lower time and round-tripped through the
          // `stdlib:<name>:<arity>` JSON token), looks up the registry,
          // pops `arity` values, and calls the JS implementation
          // with `(story, args)`. If `fn` returns a non-undefined
          // value, push it back onto the eval stack (auto-wrapping
          // JS primitives via `Value.Create`). This replaces the
          // entire per-function ControlCommand boilerplate —
          // adding a new state-aware builtin is now one entry in
          // `STDLIB` in StdLib.ts.
          const name = evalCommand._stdLibName;
          const arity = evalCommand._stdLibArity;
          const entry = lookupStateAwareStdLib(name);
          if (!entry) {
            this.Error(`Unknown stdlib function '${name}'`);
            break;
          }
          // Pop args off the stack in LIFO order, then reverse to
          // hand them to the function in source order (arg 0 first).
          const args: any[] = [];
          for (let i = 0; i < arity; i++) {
            args.unshift(this.state.PopEvaluationStack());
          }
          // Lua-style call-arg spread: the syntactically LAST arg
          // (rightmost) spreads its MultiValue into multiple args;
          // earlier args truncate any MultiValue to its first inner
          // value. `print(math.modf(3.7))` → `print(3, 0.7)`;
          // `f(math.modf(x), 1)` → `f(3, 1)` (modf truncated since
          // it's not the last arg). Pure stdlib fns (registered with
          // NativeFunctionCall) don't pass through here and continue
          // to auto-unwrap via MultiValue's transparent valueObject.
          //
          // Void (from `(function() end)()`) is conceptually an
          // empty MultiValue. As the last arg, it spreads to 0
          // values — `select('#', (function() end)())` returns 0,
          // matching Luau's empty-return semantics. As a non-last
          // arg, it's clamped to nil (same as MultiValue truncation).
          for (let k = 0; k < args.length; k++) {
            const a = args[k];
            if (a instanceof MultiValue) {
              if (k === args.length - 1) {
                args.splice(k, 1, ...a.values);
              } else {
                args[k] = a.values[0] ?? new NullValue();
              }
            } else if (a instanceof Void) {
              if (k === args.length - 1) {
                args.splice(k, 1);
              } else {
                args[k] = new NullValue();
              }
            }
          }
          const result = entry.fn(this, args);
          if (result !== undefined) {
            // Multi-return: a JS array from the stdlib fn becomes a
            // `MultiValue` slot. Each element is wrapped via
            // `Value.Create` (so primitives auto-promote). Used by
            // `math.modf`, `string.byte`, `utf8.codepoint`,
            // `table.unpack`, etc. Single-value consumers see the
            // first inner value via MultiValue's transparent
            // `valueObject` getter; multi-target assignment uses an
            // `UnpackTuple` ControlCommand to distribute the slots.
            if (Array.isArray(result)) {
              const wrappedValues: AbstractValue[] = [];
              for (const r of result) {
                if (r instanceof InkObject) {
                  wrappedValues.push(r as AbstractValue);
                } else {
                  const w = Value.Create(r);
                  if (w !== null) wrappedValues.push(w);
                }
              }
              this.state.PushEvaluationStack(new MultiValue(wrappedValues));
            } else {
              // If `fn` returned an InkObject (Value subclass, Void,
              // etc.) push it directly. JS primitives get wrapped
              // via `Value.Create` (number → IntValue/FloatValue,
              // string → StringValue, boolean → BoolValue).
              const wrapped =
                result instanceof InkObject ? result : Value.Create(result);
              if (wrapped !== null) {
                this.state.PushEvaluationStack(wrapped);
              }
            }
          } else {
            // The stdlib fn returned no value (`table.insert`,
            // `table.sort`, `print`, ...). Push the Void sentinel so
            // the eval stack stays BALANCED: statement-position call
            // sites emit a static PopEvaluatedValue, which previously
            // consumed whatever operand happened to sit beneath
            // (silently no-opping only when the stack was empty) —
            // `1 + #pack(7, 8)` lost the `1` to an inner
            // `table.insert` statement. Void coerces to nil in
            // single-value contexts and spreads to zero values in
            // call-arg position, matching Lua's "no return values".
            this.state.PushEvaluationStack(new Void());
          }
          break;
        }

        default:
          this.Error("unhandled ControlCommand: " + evalCommand);
          break;
      }

      return true;
    }

    // Variable assignment
    else if (contentObj instanceof VariableAssignment) {
      let varAss = contentObj;
      let assignedVal = this.state.PopEvaluationStack();

      // Lua/Luau `local x = f()` where `f` returns multiple values
      // assigns only the FIRST value to `x` and discards the rest.
      // Multi-target assignment uses an `UnpackTuple` ControlCommand
      // upstream, so each `VariableAssignment` in that lowering
      // already receives an unwrapped value — this guard is for the
      // single-target case. The synthetic `__varargs__` slot bound at
      // a variadic function's entry is an exception: it must keep the
      // MultiValue intact so `...` in the body reads back the full
      // tuple of extra args.
      if (assignedVal instanceof MultiValue && !varAss.isVarargsSlot) {
        assignedVal = assignedVal.values[0] ?? new NullValue();
      }

      this.state.variablesState.Assign(varAss, assignedVal);

      return true;
    }

    // Variable reference
    else if (contentObj instanceof VariableReference) {
      let varRef = contentObj;
      let foundValue = null;

      // Explicit read count value
      if (varRef.pathForCount != null) {
        let container = varRef.containerForCount;
        let count = this.state.VisitCountForContainer(container);
        foundValue = new IntValue(count);
      }

      // Normal variable reference
      else {
        foundValue = readVariable(this, varRef.name);
      }

      this.state.PushEvaluationStack(foundValue);

      return true;
    }

    // Native function call
    else if (contentObj instanceof NativeFunctionCall) {
      let func = contentObj;
      let funcParams = this.state.PopEvaluationStack(func.numberOfParameters);
      this.state.PushEvaluationStack(
        callNativeFunction(this, func, funcParams),
      );
      return true;
    }

    // No control content, must be ordinary content
    return false;
  }

  public ChoosePathString(
    path: string,
    resetCallstack = true,
    args: any[] = [],
  ) {
    this.IfAsyncWeCant("call ChoosePathString right now");
    if (this.onChoosePathString !== null) this.onChoosePathString(path, args);

    if (resetCallstack) {
      this.ResetCallstack();
    } else {
      if (this.state.callStack.currentElement!.type == PushPopType.Function) {
        let funcDetail = "";
        let container =
          this.state.callStack.currentElement!.currentPointer.container;
        if (container != null) {
          funcDetail = "(" + container.path.toString() + ") ";
        }
        throw new Error(
          "Story was running a function " +
            funcDetail +
            "when you called ChoosePathString(" +
            path +
            ") - this is almost certainly not not what you want! Full stack trace: \n" +
            this.state.callStack.callStackTrace,
        );
      }
    }

    // A cut carried output from the path the host is leaving.
    this.state.DiscardLineEnd();
    this.state.PassArgumentsToEvaluationStack(args);
    this.ChoosePath(new Path(path));
  }

  public IfAsyncWeCant(activityStr: string) {
    if (this._asyncContinueActive)
      throw new Error(
        "Can't " +
          activityStr +
          ". Story is in the middle of a ContinueAsync(). Make more ContinueAsync() calls or a single Continue() call beforehand.",
      );
  }

  public ChoosePath(p: Path, incrementingTurnIndex: boolean = true) {
    this._stateIsPristine = false;
    this.state.SetChosenPath(p, incrementingTurnIndex);

    // Take a note of newly visited containers for read counts etc
    this.VisitChangedContainersDueToDivert();
  }

  public ChooseChoiceIndex(choiceIdx: number) {
    choiceIdx = choiceIdx;
    let choices = this.currentChoices;
    this.Assert(
      choiceIdx >= 0 && choiceIdx < choices.length,
      "choice out of range",
    );

    let choiceToChoose = choices[choiceIdx]!;
    this.ChooseChoice(choiceToChoose);
  }

  public ChooseChoice(choiceToChoose: Choice) {
    if (this.onMakeChoice !== null) this.onMakeChoice(choiceToChoose);

    if (choiceToChoose.threadAtGeneration === null) {
      return throwNullException("choiceToChoose.threadAtGeneration");
    }
    if (choiceToChoose.targetPath === null) {
      return throwNullException("choiceToChoose.targetPath");
    }

    const previousPointer = this.state.previousPointer.copy();
    const currentPointer = this.state.currentPointer.copy();

    // What a choice leads to starts a new box, so no line before the choice
    // is one a `..` after it joins.
    this.state.lineJoinable = false;
    this.state.callStack.currentThread = choiceToChoose.threadAtGeneration;

    this.state.previousPointer = previousPointer;
    this.state.currentPointer = currentPointer;

    this.ChoosePath(choiceToChoose.targetPath);
  }

  public HasFunction(functionName: string) {
    try {
      return this.KnotContainerWithName(functionName) != null;
    } catch (e) {
      return false;
    }
  }

  public EvaluateFunction(
    functionName: string,
    args: any[] = [],
    returnTextOutput: boolean = false,
  ): Story.EvaluateFunctionTextOutput | any {
    // EvaluateFunction behaves slightly differently than the C# version.
    // In C#, you can pass a (second) parameter `out textOutput` to get the
    // text outputted by the function. This is not possible in js. Instead,
    // we maintain the regular signature (functionName, args), plus an
    // optional third parameter returnTextOutput. If set to true, we will
    // return both the textOutput and the returned value, as an object.

    if (this.onEvaluateFunction !== null)
      this.onEvaluateFunction(functionName, args);

    this.IfAsyncWeCant("evaluate a function");

    if (functionName == null) {
      throw new Error("Function is null");
    } else if (functionName == "" || functionName.trim() == "") {
      throw new Error("Function is empty or white space.");
    }

    let funcContainer = this.KnotContainerWithName(functionName);
    if (funcContainer == null) {
      throw new Error("Function doesn't exist: '" + functionName + "'");
    }

    let outputStreamBefore: InkObject[] = [];
    outputStreamBefore.push(...this.state.outputStream);
    const lineEnd = this._state.SuspendLineEnd();
    this._state.ResetOutput();

    this.state.StartFunctionEvaluationFromGame(funcContainer, args);

    // Evaluate the function, and collect the string output
    let stringOutput = new StringBuilder();
    while (this.canContinue) {
      stringOutput.Append(this.Continue());
    }
    let textOutput = stringOutput.toString();

    this._state.ResetOutput(outputStreamBefore);
    this._state.ResumeLineEnd(lineEnd);

    let result = this.state.CompleteFunctionEvaluationFromGame();
    if (this.onCompleteEvaluateFunction != null)
      this.onCompleteEvaluateFunction(functionName, args, textOutput, result);

    return returnTextOutput ? { returned: result, output: textOutput } : result;
  }

  /**
   * Invoke a sparkdown function value from inside a stdlib JS impl,
   * synchronously, and return whatever it pushed onto the eval stack.
   *
   * Unblocks "stdlib that takes a user function":
   * - `table.sort(t, cmp)` — comparator
   * - `string.gsub(s, p, fn)` — replacement
   * - `pcall` / `xpcall` — protected call (the call half)
   *
   * `fnValue` may be:
   * - An `ObjectValue` carrying a closure marker (`__closure_fn` /
   *   `__closure_upvals` / `__closure_user_arity`) — anonymous
   *   function literal with captured upvalues.
   * - A `DivertTargetValue` — bare knot reference (no upvalues).
   * - A `VariablePointerValue` — recursively resolved.
   *
   * Driving the inner call: this routine snapshots callstack depth,
   * eval stack depth, currentPointer, and output stream. It sets up
   * the divert exactly the same way `CallValueAsFunction` does, then
   * loops `Step()` until the inner Function frame pops (callstack
   * back to the snapshot). Return values left above the snapshot
   * eval-stack height are collected and returned. The output stream
   * is restored on the way out so the callback can't leak narrative
   * text into the calling story flow.
   *
   * The callback runs inside the step that called it, so it works the
   * same during `ContinueAsync()` as during `Continue()`: it never
   * starts a continue of its own. Route search's pause before
   * conditions is off while it runs, since the conditions route search
   * forces are the story's decisions, not ones inside a callback.
   *
   * Errors inside the callback propagate via `story.Error`; without
   * a `pcall` trap (#98), they abort the whole story — that's the
   * same behaviour as any other runtime error today.
   */
  public CallLuauFunction(
    fnValue: AbstractValue,
    args: AbstractValue[],
  ): AbstractValue[] {
    // VariablePointerValue: deref and recurse.
    if (fnValue instanceof VariablePointerValue) {
      const resolved = this.state.variablesState.GetVariableWithName(
        fnValue.variableName,
      ) as AbstractValue | null;
      if (resolved == null) {
        throw new StoryException(
          "CallLuauFunction: variable pointer references unresolved variable",
        );
      }
      return this.CallLuauFunction(resolved, args);
    }

    // `__stdlib_fn` marker: stdlib builtin referenced first-class —
    // dispatch the entry directly (there's no ink frame to drive).
    const stdlibResults = tryInvokeStdLibMarkerValue(this, fnValue, args);
    if (stdlibResults != null) return stdlibResults;

    const savedCallStackLen = this.state.callStack.elements.length;
    const savedEvalLen = this.state.evaluationStack.length;
    const savedPointer = this.state.currentPointer.copy();
    const outputStreamBefore: InkObject[] = [...this.state.outputStream];
    const lineEnd = this.state.SuspendLineEnd();
    this.state.ResetOutput();
    const pauseBeforeConditions = this.pauseBeforeEvaluatingConditions;
    this.pauseBeforeEvaluatingConditions = false;

    let path: Path | null = null;
    try {
      // Lua call-site semantics: discard extra args / pad missing
      // with nil (see normalizeLuauCallArgs).
      const callArgs = normalizeLuauCallArgs(this, fnValue, args);
      // Closure case: extractClosureTarget modifies the eval stack
      // (pops user args, pushes upvals, re-pushes user args). So push
      // user args first, then let it rearrange.
      if (fnValue instanceof ObjectValue) {
        for (const a of callArgs) this.state.PushEvaluationStack(a);
        const target = extractClosureTarget(fnValue, this);
        if (target == null) {
          // Not a closure-shaped ObjectValue. Restore stack + bail.
          for (let i = 0; i < callArgs.length; i++)
            this.state.PopEvaluationStack();
          // `__call` metamethod: a plain table is callable when its
          // metatable defines `__call`; Lua rewrites `t(args...)` to
          // `__call(t, args...)`. Recurse with the handler so chained
          // callables (handler itself a `__call` table) also resolve.
          const callHandler = lookupMetamethod(fnValue, "__call");
          if (callHandler != null && !(callHandler instanceof NullValue)) {
            return this.CallLuauFunction(callHandler, [fnValue, ...args]);
          }
          throw new StoryException(
            "CallLuauFunction: ObjectValue is not a closure (missing `__closure_fn`)",
          );
        }
        path = (target as ContainerTarget).path;
      } else if (fnValue instanceof DivertTargetValue) {
        for (const a of callArgs) this.state.PushEvaluationStack(a);
        path = fnValue.value;
      } else {
        throw new StoryException(
          `CallLuauFunction: expected a function value, got ${fnValue}`,
        );
      }

      if (path == null) {
        throw new StoryException(
          "CallLuauFunction: could not resolve function value to a path",
        );
      }

      // Set up the divert exactly like the in-bytecode
      // CallValueAsFunction handler (line ~1755 in this file).
      this.state.divertedPointer = this.PointerAtPath(path);
      this.state.callStack.Push(
        PushPopType.Function,
        undefined,
        this.state.outputStream.length,
      );
      // CRITICAL: when the in-bytecode CallValueAsFunction sets up
      // the divert, Step's tail-end `NextContent()` consumes
      // `divertedPointer` to advance to the function body. Since
      // we're calling from JS (outside the op-processing path), we
      // must drive `NextContent()` manually first — otherwise the
      // next `Step()` will re-process the current op (the
      // `RunStdLibFunction` for OUR caller), re-entering us with
      // the wrong eval-stack state.
      this.NextContent();

      // Drive Step until the inner Function frame pops back. Bound the
      // steps to avoid hangs on misbehaving callbacks, counting the steps
      // of callbacks nested inside this one, which all run inside one of
      // its own steps.
      const MAX_STEPS = 100000;
      const firstStep = this.stepCount;
      while (
        this.state.callStack.elements.length > savedCallStackLen &&
        !this.state.currentPointer.isNull
      ) {
        this.Step();
        if (this.stepCount - firstStep > MAX_STEPS) {
          throw new StoryException(
            "CallLuauFunction: callback exceeded step limit (possible infinite loop)",
          );
        }
      }

      // Collect return values left above the saved eval-stack height.
      const results: AbstractValue[] = [];
      while (this.state.evaluationStack.length > savedEvalLen) {
        results.unshift(this.state.PopEvaluationStack() as AbstractValue);
      }
      return results;
    } catch (e) {
      // The pointer is restored to the caller's below, so an error the
      // callback raised keeps the path of the content that raised it. An
      // error from a callback nested inside this one already carries its own.
      if (e instanceof StoryException && e.raisedPath == null) {
        e.raisedPath = this.state.currentPointer.path?.toString() ?? null;
      }
      throw e;
    } finally {
      // Restore everything — output stream, currentPointer (in case
      // the inner ~ret restored it to something unexpected), and
      // ensure we don't leave the callstack inflated if an exception
      // unwound mid-call.
      while (this.state.callStack.elements.length > savedCallStackLen) {
        this.state.PopCallStack();
      }
      this.state.currentPointer = savedPointer;
      this.state.ResetOutput(outputStreamBefore);
      this.state.ResumeLineEnd(lineEnd);
      this.pauseBeforeEvaluatingConditions = pauseBeforeConditions;
    }
  }

  /**
   * Protected variant of `CallLuauFunction`. Implements `pcall`'s
   * trap: drive the inner function; if it throws a `StoryException`
   * (from `story.Error`) or adds a runtime error to
   * `state.currentErrors`, capture the message and return
   * `{ ok: false, errorMessage }` instead of letting the error
   * abort the story.
   *
   * The trapped error is REMOVED from `state.currentErrors` — pcall's
   * contract is "the error doesn't escape the protected block." If
   * the user wants to surface it, they re-raise or log it via the
   * second return.
   */
  public CallLuauFunctionProtected(
    fnValue: AbstractValue,
    args: AbstractValue[],
  ): {
    ok: boolean;
    values: AbstractValue[];
    errorMessage?: string;
  } {
    if (fnValue instanceof VariablePointerValue) {
      const resolved = this.state.variablesState.GetVariableWithName(
        fnValue.variableName,
      ) as AbstractValue | null;
      if (resolved == null) {
        return {
          ok: false,
          values: [],
          errorMessage:
            "pcall: variable pointer references unresolved variable",
        };
      }
      return this.CallLuauFunctionProtected(resolved, args);
    }

    // `__stdlib_fn` marker: stdlib builtin referenced first-class
    // (e.g. `pcall(rawequal, "a", "a")`). Dispatch the entry directly
    // and trap anything it raises — both `story.Error` throws and
    // errors recorded on `state.currentErrors`.
    if (
      fnValue instanceof ObjectValue &&
      (fnValue.value as Map<string, AbstractValue>)?.get("__stdlib_fn") != null
    ) {
      const errCountBefore = this.state.currentErrors?.length ?? 0;
      try {
        const values = tryInvokeStdLibMarkerValue(this, fnValue, args);
        if (values != null) {
          const errsNow = this.state.currentErrors;
          if (errsNow && errsNow.length > errCountBefore) {
            const msg = errsNow[errCountBefore]!;
            errsNow.length = errCountBefore;
            return { ok: false, values: [], errorMessage: msg };
          }
          return { ok: true, values };
        }
      } catch (e) {
        if (e instanceof StoryException) {
          const errsNow = this.state.currentErrors;
          if (errsNow && errsNow.length > errCountBefore) {
            errsNow.length = errCountBefore;
          }
          return { ok: false, values: [], errorMessage: e.message };
        }
        throw e;
      }
    }

    const savedCallStackLen = this.state.callStack.elements.length;
    const savedEvalLen = this.state.evaluationStack.length;
    const savedPointer = this.state.currentPointer.copy();
    const outputStreamBefore: InkObject[] = [...this.state.outputStream];
    const savedErrorCount = this.state.currentErrors?.length ?? 0;
    const lineEnd = this.state.SuspendLineEnd();
    this.state.ResetOutput();
    const pauseBeforeConditions = this.pauseBeforeEvaluatingConditions;
    this.pauseBeforeEvaluatingConditions = false;

    let path: Path | null = null;
    let trappedError: string | null = null;
    try {
      // Lua call-site semantics: discard extra args / pad missing
      // with nil (see normalizeLuauCallArgs).
      const callArgs = normalizeLuauCallArgs(this, fnValue, args);
      if (fnValue instanceof ObjectValue) {
        for (const a of callArgs) this.state.PushEvaluationStack(a);
        const target = extractClosureTarget(fnValue, this);
        if (target == null) {
          for (let i = 0; i < callArgs.length; i++)
            this.state.PopEvaluationStack();
          // `__call` metamethod: same callable-table rewrite as
          // CallLuauFunction — `t(args...)` → `__call(t, args...)`.
          const callHandler = lookupMetamethod(fnValue, "__call");
          if (callHandler != null && !(callHandler instanceof NullValue)) {
            return this.CallLuauFunctionProtected(callHandler, [
              fnValue,
              ...args,
            ]);
          }
          return {
            ok: false,
            values: [],
            errorMessage:
              "pcall: target ObjectValue is not a closure (missing `__closure_fn`)",
          };
        }
        path = (target as ContainerTarget).path;
      } else if (fnValue instanceof DivertTargetValue) {
        for (const a of callArgs) this.state.PushEvaluationStack(a);
        path = fnValue.value;
      } else {
        return {
          ok: false,
          values: [],
          errorMessage: `pcall: expected a function value, got ${fnValue}`,
        };
      }

      if (path == null) {
        return {
          ok: false,
          values: [],
          errorMessage: "pcall: could not resolve function value to a path",
        };
      }

      this.state.divertedPointer = this.PointerAtPath(path);
      this.state.callStack.Push(
        PushPopType.Function,
        undefined,
        this.state.outputStream.length,
      );
      this.NextContent();

      // Bounded as in `CallLuauFunction`, nested callbacks' steps included.
      const MAX_STEPS = 100000;
      const firstStep = this.stepCount;
      while (
        this.state.callStack.elements.length > savedCallStackLen &&
        !this.state.currentPointer.isNull
      ) {
        try {
          this.Step();
        } catch (e) {
          if (e instanceof StoryException) {
            trappedError = e.message;
            break;
          }
          throw e;
        }
        // Also check the "errors added without throwing" path —
        // some stdlib impls call `story.AddError` directly rather
        // than `story.Error`. Truncate any new errors so they don't
        // surface to the host, and treat the first as our message.
        const errs = this.state.currentErrors;
        if (errs && errs.length > savedErrorCount) {
          trappedError = errs[savedErrorCount]!;
          // Truncate.
          errs.length = savedErrorCount;
          break;
        }
        if (this.stepCount - firstStep > MAX_STEPS) {
          trappedError =
            "pcall: callback exceeded step limit (possible infinite loop)";
          break;
        }
      }

      // Truncate any errors added during the call (covers errors
      // added via story.AddError between the last check and now).
      const errs2 = this.state.currentErrors;
      if (errs2 && errs2.length > savedErrorCount) {
        if (trappedError == null) trappedError = errs2[savedErrorCount]!;
        errs2.length = savedErrorCount;
      }

      if (trappedError != null) {
        return { ok: false, values: [], errorMessage: trappedError };
      }

      const results: AbstractValue[] = [];
      while (this.state.evaluationStack.length > savedEvalLen) {
        results.unshift(this.state.PopEvaluationStack() as AbstractValue);
      }
      // Empty-return functions push a `Void` sentinel at PopFunction
      // time. From pcall's perspective that's "the function returned
      // zero values" — so `pcall(function() end)` returns just
      // `(true)` rather than `(true, void)`. Strip leading Voids so
      // the wrapping `MultiValue([true, ...values])` in `pcall` /
      // `xpcall` reflects the actual return count Lua sees.
      while (results.length > 0 && results[0] instanceof Void) {
        results.shift();
      }
      return { ok: true, values: results };
    } finally {
      while (this.state.callStack.elements.length > savedCallStackLen) {
        this.state.PopCallStack();
      }
      // Drop any partial eval-stack residue from a failed call.
      while (this.state.evaluationStack.length > savedEvalLen) {
        this.state.PopEvaluationStack();
      }
      this.state.currentPointer = savedPointer;
      this.state.ResetOutput(outputStreamBefore);
      this.state.ResumeLineEnd(lineEnd);
      this.pauseBeforeEvaluatingConditions = pauseBeforeConditions;
    }
  }

  public EvaluateExpression(exprContainer: Container) {
    let startCallStackHeight = this.state.callStack.elements.length;

    this.state.callStack.Push(PushPopType.Tunnel);

    this._temporaryEvaluationContainer = exprContainer;

    this.state.GoToStart();

    let evalStackHeight = this.state.evaluationStack.length;

    this.Continue();

    this._temporaryEvaluationContainer = null;

    // Should have fallen off the end of the Container, which should
    // have auto-popped, but just in case we didn't for some reason,
    // manually pop to restore the state (including currentPath).
    if (this.state.callStack.elements.length > startCallStackHeight) {
      this.state.PopCallStack();
    }

    let endStackHeight = this.state.evaluationStack.length;
    if (endStackHeight > evalStackHeight) {
      return this.state.PopEvaluationStack();
    } else {
      return null;
    }
  }

  public allowExternalFunctionFallbacks: boolean = false;

  public collapseWhitespace: boolean = true;

  public processEscapes: boolean = true;

  /**
   * Optional callback that formats the message passed to the `error`
   * stdlib BEFORE it's thrown. The default behaviour passes the
   * message through unchanged, matching how an LSP host wants
   * errors (it shows source/line separately in its own UI).
   *
   * The conformance test harness sets this to prepend
   * `<sourceBasename>:<line>: ` so Luau-spec assertions like
   * `pcall(function() error("oops") end)` returning
   * `"<file>:<line>: oops"` can be checked precisely.
   *
   * Signature: receives `this` story and the raw message, returns
   * the formatted string. Implementations typically read
   * `story.currentDebugMetadata` to look up source/line info.
   */
  public errorMessageFormatter?: (story: Story, message: string) => string;

  public CallExternalFunction(
    funcName: string | null,
    numberOfArguments: number,
  ) {
    if (funcName === null) {
      return throwNullException("funcName");
    }
    let funcDef = this._externals.get(funcName);
    let fallbackFunctionContainer = null;

    let foundExternal = typeof funcDef !== "undefined";

    if (!foundExternal) {
      if (this.allowExternalFunctionFallbacks) {
        fallbackFunctionContainer = this.KnotContainerWithName(funcName);
        this.Assert(
          fallbackFunctionContainer !== null,
          "Trying to call external function '" +
            funcName +
            "' which has not been bound, and fallback ink function could not be found.",
        );

        // Divert direct into fallback function and we're done
        this.state.callStack.Push(
          PushPopType.Function,
          undefined,
          this.state.outputStream.length,
        );
        this.state.divertedPointer = Pointer.StartOf(fallbackFunctionContainer);
        return;
      } else {
        this.Assert(
          false,
          "Trying to call external function '" +
            funcName +
            "' which has not been bound (and ink fallbacks disabled).",
        );
      }
    }

    // Pop arguments
    let args: any[] = [];
    for (let i = 0; i < numberOfArguments; ++i) {
      // var poppedObj = state.PopEvaluationStack () as Value;
      let poppedObj = asOrThrows(this.state.PopEvaluationStack(), Value);
      let valueObj = poppedObj.valueObject;
      args.push(valueObj);
    }

    // Reverse arguments from the order they were popped,
    // so they're the right way round again.
    args.reverse();

    // Run the function!
    let funcResult = funcDef!.function(args);

    // Convert return value (if any) to the a type that the ink engine can use
    let returnObj = null;
    if (funcResult != null) {
      returnObj = Value.Create(funcResult);
      this.Assert(
        returnObj !== null,
        "Could not create ink value from returned object of type " +
          typeof funcResult,
      );
    } else {
      returnObj = new Void();
    }

    this.state.PushEvaluationStack(returnObj);
  }

  public BindExternalFunctionGeneral(
    funcName: string,
    func: Story.ExternalFunction,
  ) {
    this.IfAsyncWeCant("bind an external function");
    this.Assert(
      !this._externals.has(funcName),
      "Function '" + funcName + "' has already been bound.",
    );
    this._externals.set(funcName, { function: func });
  }

  public TryCoerce(value: any) {
    // We're skipping type coercition in this implementation. First of, js
    // is loosely typed, so it's not that important. Secondly, there is no
    // clean way (AFAIK) for the user to describe what type of parameters
    // they expect.
    return value;
  }

  public BindExternalFunction(funcName: string, func: Story.ExternalFunction) {
    this.Assert(func != null, "Can't bind a null function");

    this.BindExternalFunctionGeneral(
      funcName,
      (args: any) => {
        this.Assert(
          args.length >= func.length,
          "External function expected " + func.length + " arguments",
        );

        let coercedArgs = [];
        for (let i = 0, l = args.length; i < l; i++) {
          coercedArgs[i] = this.TryCoerce(args[i]);
        }
        return func.apply(null, coercedArgs);
      },
    );
  }

  public UnbindExternalFunction(funcName: string) {
    this.IfAsyncWeCant("unbind an external a function");
    this.Assert(
      this._externals.has(funcName),
      "Function '" + funcName + "' has not been bound.",
    );
    this._externals.delete(funcName);
  }

  public ValidateExternalBindings(): void;
  public ValidateExternalBindings(
    c: Container | null,
    missingExternals: Set<string>,
  ): void;
  public ValidateExternalBindings(
    o: InkObject | null,
    missingExternals: Set<string>,
  ): void;
  public ValidateExternalBindings() {
    let c: Container | null = null;
    let o: InkObject | null = null;
    let missingExternals: Set<string> = arguments[1] || new Set();

    if (arguments[0] instanceof Container) {
      c = arguments[0];
    }

    if (arguments[0] instanceof InkObject) {
      o = arguments[0];
    }

    if (c === null && o === null) {
      this.ValidateExternalBindings(
        this._mainContentContainer,
        missingExternals,
      );
      this._hasValidatedExternals = true;

      // No problem! Validation complete
      if (missingExternals.size == 0) {
        this._hasValidatedExternals = true;
      } else {
        let message = "Error: Missing function binding for external";
        message += missingExternals.size > 1 ? "s" : "";
        message += ": '";
        message += Array.from(missingExternals).join("', '");
        message += "' ";
        message += this.allowExternalFunctionFallbacks
          ? ", and no fallback ink function found."
          : " (ink fallbacks disabled)";

        this.Error(message);
      }
    } else if (c != null) {
      for (let innerContent of c.content) {
        let container = innerContent as Container;
        if (container == null || !container.hasValidName)
          this.ValidateExternalBindings(innerContent, missingExternals);
      }
      for (let [, value] of c.namedContent) {
        this.ValidateExternalBindings(
          asOrNull(value, InkObject),
          missingExternals,
        );
      }
    } else if (o != null) {
      let divert = asOrNull(o, Divert);
      if (divert && divert.isExternal) {
        let name = divert.targetPathString;
        if (name === null) {
          return throwNullException("name");
        }
        if (!this._externals.has(name)) {
          if (this.allowExternalFunctionFallbacks) {
            let fallbackFound =
              this.mainContentContainer.namedContent.has(name);
            if (!fallbackFound) {
              missingExternals.add(name);
            }
          } else {
            missingExternals.add(name);
          }
        }
      }
    }
  }

  public ObserveVariable(
    variableName: string,
    observer: Story.VariableObserver,
  ) {
    this.IfAsyncWeCant("observe a new variable");

    if (this._variableObservers === null) this._variableObservers = new Map();

    if (!this.state.variablesState.GlobalVariableExistsWithName(variableName))
      throw new Error(
        "Cannot observe variable '" +
          variableName +
          "' because it wasn't declared in the ink story.",
      );

    if (this._variableObservers.has(variableName)) {
      this._variableObservers.get(variableName)!.push(observer);
    } else {
      this._variableObservers.set(variableName, [observer]);
    }
  }

  public ObserveVariables(
    variableNames: string[],
    observers: Story.VariableObserver[],
  ) {
    for (let i = 0, l = variableNames.length; i < l; i++) {
      this.ObserveVariable(variableNames[i]!, observers[i]!);
    }
  }

  public RemoveVariableObserver(
    observer?: Story.VariableObserver,
    specificVariableName?: string,
  ) {
    // A couple of things to know about this method:
    //
    // 1. Since `RemoveVariableObserver` is exposed to the JavaScript world,
    //    optionality is marked as `undefined` rather than `null`.
    //    To keep things simple, null-checks are performed using regular
    //    equality operators, where undefined == null.
    //
    // 2. Since C# delegates are translated to arrays of functions,
    //    -= becomes a call to splice and null-checks are replaced by
    //    emptiness-checks.
    //
    this.IfAsyncWeCant("remove a variable observer");

    if (this._variableObservers === null) return;

    if (specificVariableName != null) {
      if (this._variableObservers.has(specificVariableName)) {
        if (observer != null) {
          let variableObservers =
            this._variableObservers.get(specificVariableName);
          if (variableObservers != null) {
            variableObservers.splice(variableObservers.indexOf(observer), 1);
            if (variableObservers.length === 0) {
              this._variableObservers.delete(specificVariableName);
            }
          }
        } else {
          this._variableObservers.delete(specificVariableName);
        }
      }
    } else if (observer != null) {
      let keys = this._variableObservers.keys();
      for (let varName of keys) {
        let variableObservers = this._variableObservers.get(varName);
        if (variableObservers != null) {
          variableObservers.splice(variableObservers.indexOf(observer), 1);
          if (variableObservers.length === 0) {
            this._variableObservers.delete(varName);
          }
        }
      }
    }
  }

  public VariableStateDidChangeEvent(
    variableName: string,
    newValueObj: InkObject,
  ) {
    // Before the observer check below: a global written from outside the story
    // leaves the state no longer the one a reset built, whether or not anybody
    // is watching that variable.
    this._stateIsPristine = false;

    if (this._variableObservers === null) return;

    let observers = this._variableObservers.get(variableName);
    if (typeof observers !== "undefined") {
      if (!(newValueObj instanceof Value)) {
        throw new Error(
          "Tried to get the value of a variable that isn't a standard type",
        );
      }
      // var val = newValueObj as Value;
      let val = asOrThrows(newValueObj, Value);

      for (let observer of observers) {
        observer(variableName, val.valueObject);
      }
    }
  }

  get globalTags() {
    return this.TagsAtStartOfFlowContainerWithPathString("");
  }

  public TagsForContentAtPath(path: string) {
    return this.TagsAtStartOfFlowContainerWithPathString(path);
  }

  public TagsAtStartOfFlowContainerWithPathString(pathString: string) {
    let path = new Path(pathString);

    let flowContainer = this.ContentAtPath(path).container;
    if (flowContainer === null) {
      return throwNullException("flowContainer");
    }
    // Descend into the first sub-container as long as it's a structural
    // wrapper around the real flow body (vanilla ink shape). Stop the
    // descent if this level already has MULTIPLE consecutive per-line
    // tag wrapper containers at the front — that's sparkdown's per-line
    // tag layout, and we need to walk all those siblings to collect
    // every leading tag, not just the first one. (When there's only a
    // single leading tag wrapper, descending into it gives identical
    // results to walking the wrapper's contents from outside.)
    const isTagWrapper = (obj: InkObject | undefined): boolean => {
      if (!(obj instanceof Container)) return false;
      const first = obj.content[0];
      const cmd = asOrNull(first, ControlCommand);
      return (
        cmd != null && cmd.commandType == ControlCommand.CommandType.BeginTag
      );
    };
    while (true) {
      let firstContent: InkObject = flowContainer.content[0]!;
      if (firstContent instanceof Container) {
        if (
          isTagWrapper(firstContent) &&
          isTagWrapper(flowContainer.content[1])
        ) {
          break;
        }
        flowContainer = firstContent;
      } else break;
    }

    let inTag = false;
    let tags: string[] | null = null;

    // Collect every BeginTag/StringValue/EndTag triplet at the start of
    // the flow. Sparkdown's compile pipeline chunks each top-level
    // `# tag` line into its own sibling display-line container, so the
    // walk must descend into those wrapper containers as long as they
    // hold ONLY tag triplets (no non-tag runtime content). The vanilla
    // ink form produces a single container with tags as flat children,
    // which this loop still handles via the non-Container branch.
    const pushFromSequence = (items: ReadonlyArray<InkObject>): boolean => {
      // Returns `true` to keep walking later siblings; `false` once a
      // non-tag, non-control-command item ends the run of leading tags.
      for (const c of items) {
        const command = asOrNull(c, ControlCommand);
        if (command != null) {
          if (command.commandType == ControlCommand.CommandType.BeginTag) {
            inTag = true;
          } else if (
            command.commandType == ControlCommand.CommandType.EndTag
          ) {
            inTag = false;
          }
          continue;
        }
        if (inTag) {
          const str = asOrNull(c, StringValue);
          if (str !== null) {
            if (tags === null) tags = [];
            if (str.value !== null) tags.push(str.value);
          } else {
            this.Error(
              "Tag contained non-text content. Only plain text is allowed when using globalTags or TagsAtContentPath. If you want to evaluate dynamic content, you need to use story.Continue().",
            );
          }
          continue;
        }
        // A wrapper container at the front of the flow: descend if its
        // first item is a BeginTag (this is sparkdown's per-line tag
        // wrapper). Otherwise the run of leading tags has ended.
        const innerContainer = asOrNull(c, Container);
        if (innerContainer != null) {
          const innerFirst = innerContainer.content[0];
          const innerCommand = asOrNull(innerFirst, ControlCommand);
          if (
            innerCommand != null &&
            innerCommand.commandType == ControlCommand.CommandType.BeginTag
          ) {
            if (!pushFromSequence(innerContainer.content)) return false;
            continue;
          }
        }
        return false;
      }
      return true;
    };

    pushFromSequence(flowContainer.content);

    return tags;
  }

  public BuildStringOfHierarchy() {
    let sb = new StringBuilder();

    this.mainContentContainer.BuildStringOfHierarchy(
      sb,
      0,
      this.state.currentPointer.Resolve(),
    );

    return sb.toString();
  }

  public BuildStringOfContainer(container: Container) {
    let sb = new StringBuilder();
    container.BuildStringOfHierarchy(
      sb,
      0,
      this.state.currentPointer.Resolve(),
    );
    return sb.toString();
  }

  // What `done` does: ends the current thread, or ends the flow safely when
  // no thread is left to pop.
  protected StopFlowInThread() {
    // We may exist in the context of the initial
    // act of creating the thread, or in the context of
    // evaluating the content.
    if (this.state.callStack.canPopThread) {
      this.state.callStack.PopThread();
    }

    // In normal flow - allow safe exit without warning
    else {
      this.state.didSafeExit = true;

      // Stop flow in current thread
      this.state.currentPointer = Pointer.Null;
    }
  }

  // Reports a content path the story ran (`onExecute`). While a line end
  // waits, which continue shows what the path ran for is not yet known, so the
  // path is held (`StoryState.heldPaths`) until the run shows something or the
  // continue ends.
  // The pointer's path is read only when a host listens, as reading it is not
  // safe for every pointer the story steps through.
  protected AnnounceExecution(pointer: Pointer) {
    if (this.onExecute === null) return;
    const path = pointer.path?.toString();
    if (this.state.lineEndPending || this.state.outputCut !== null) {
      if (path !== undefined) this.state.heldPaths.push(path);
      return;
    }
    this.onExecute(path);
  }

  public NextContent() {
    this.state.previousPointer = this.state.currentPointer.copy();

    if (!this.state.divertedPointer.isNull) {
      this.AnnounceExecution(this.state.currentPointer);

      this.state.currentPointer = this.state.divertedPointer.copy();
      this.state.divertedPointer = Pointer.Null;

      this.VisitChangedContainersDueToDivert();

      if (!this.state.currentPointer.isNull) {
        return;
      }
    }

    this.AnnounceExecution(this.state.previousPointer);

    let successfulPointerIncrement = this.IncrementContentPointer();

    if (!successfulPointerIncrement) {
      let didPop = false;

      if (this.state.callStack.CanPop(PushPopType.Function)) {
        this.state.PopCallStack(PushPopType.Function);

        if (this.state.inExpressionEvaluation) {
          this.state.PushEvaluationStack(new Void());
        }

        didPop = true;
      } else if (this.state.callStack.canPopThread) {
        this.state.callStack.PopThread();

        didPop = true;
      } else {
        this.state.TryExitFunctionEvaluationFromGame();
      }

      if (didPop && !this.state.currentPointer.isNull) {
        this.NextContent();
      }
    }
  }

  public IncrementContentPointer() {
    let successfulIncrement = true;

    let pointer = this.state.currentPointer.copy();
    pointer.index ??= 0;
    pointer.index++;

    if (pointer.container === null) {
      return throwNullException("pointer.container");
    }
    while (
      pointer.index != null &&
      pointer.index >= pointer.container.content.length
    ) {
      successfulIncrement = false;

      // Container nextAncestor = pointer.container.parent as Container;
      let nextAncestor = asOrNull(pointer.container.parent, Container);
      if (nextAncestor instanceof Container === false) {
        break;
      }

      let indexInAncestor = nextAncestor!.content.indexOf(pointer.container);
      if (indexInAncestor == -1) {
        break;
      }

      pointer = new Pointer(nextAncestor, indexInAncestor);

      pointer.index ??= 0;
      pointer.index++;

      successfulIncrement = true;
      if (pointer.container === null) {
        return throwNullException("pointer.container");
      }
    }

    if (!successfulIncrement) pointer = Pointer.Null;

    this.state.callStack.currentElement!.previousPointer =
      this.state.callStack.currentElement!.currentPointer.copy();
    this.state.callStack.currentElement!.currentPointer = pointer.copy();

    return successfulIncrement;
  }

  public TryFollowDefaultInvisibleChoice() {
    let allChoices = this._state.currentChoices;

    let invisibleChoices = allChoices.filter((c) => c.isInvisibleDefault);

    if (
      invisibleChoices.length == 0 ||
      allChoices.length > invisibleChoices.length
    )
      return false;

    let choice = invisibleChoices[0];

    if (choice!.targetPath === null) {
      return throwNullException("choice.targetPath");
    }

    if (choice!.threadAtGeneration === null) {
      return throwNullException("choice.threadAtGeneration");
    }

    this.state.callStack.currentThread = choice!.threadAtGeneration;

    this.ChoosePath(choice!.targetPath, false);

    return true;
  }

  public NextSequenceShuffleIndex() {
    // var numElementsIntVal = state.PopEvaluationStack () as IntValue;
    let numElementsIntVal = asOrNull(this.state.PopEvaluationStack(), IntValue);
    if (!(numElementsIntVal instanceof IntValue)) {
      this.Error("expected number of elements in sequence for shuffle index");
      return 0;
    }

    let seqContainer = this.state.currentPointer.container;
    if (seqContainer === null) {
      return throwNullException("seqContainer");
    }

    // Originally a primitive type, but here, can be null.
    // TODO: Replace by default value?
    if (numElementsIntVal.value === null) {
      return throwNullException("numElementsIntVal.value");
    }
    let numElements = numElementsIntVal.value;

    // var seqCountVal = state.PopEvaluationStack () as IntValue;
    let seqCountVal = asOrThrows(this.state.PopEvaluationStack(), IntValue);
    let seqCount = seqCountVal.value;

    // Originally a primitive type, but here, can be null.
    // TODO: Replace by default value?
    if (seqCount === null) {
      return throwNullException("seqCount");
    }

    let loopIndex = seqCount / numElements;
    let iterationIndex = seqCount % numElements;

    let seqPathStr = seqContainer.path.toString();
    let sequenceHash = 0;
    for (let i = 0, l = seqPathStr.length; i < l; i++) {
      sequenceHash += seqPathStr.charCodeAt(i) || 0;
    }
    let randomSeed = sequenceHash + loopIndex + this.state.storySeed;
    let random = new PRNG(Math.floor(randomSeed));

    let unpickedIndices = [];
    for (let i = 0; i < numElements; ++i) {
      unpickedIndices.push(i);
    }

    for (let i = 0; i <= iterationIndex; ++i) {
      let chosen = random.next() % unpickedIndices.length;
      let chosenIndex = unpickedIndices[chosen];
      unpickedIndices.splice(chosen, 1);

      if (i == iterationIndex) {
        return chosenIndex;
      }
    }

    throw new Error("Should never reach here");
  }

  public Error(message: string, useEndLineNumber = false): never {
    let e = new StoryException(message);
    e.useEndLineNumber = useEndLineNumber;
    throw e;
  }

  /** Raise `message` in place of `cause`, an error a callback raised, keeping
   *  where the callback raised it. */
  public ErrorFrom(message: string, cause: unknown): never {
    let e = new StoryException(message);
    if (cause instanceof StoryException) {
      e.raisedPath = cause.raisedPath;
    }
    throw e;
  }

  public Warning(message: string) {
    this.AddError(message, true);
  }

  public AddError(
    message: string,
    isWarning = false,
    useEndLineNumber = false,
    raisedPath: string | null = null,
  ) {
    let dm = this.currentDebugMetadata;

    // The content being executed as the error is raised, unless the error
    // names it itself (`StoryException.raisedPath`). An error raised after the
    // story ran out of content has no current pointer, so it names the last
    // content that ran.
    const at = this.state.currentPointer.isNull
      ? this.state.previousPointer
      : this.state.currentPointer;
    const raised: RaisedError = {
      message,
      path: raisedPath ?? at.path?.toString() ?? null,
    };

    let errorTypeStr = isWarning ? "WARNING" : "ERROR";

    if (dm != null) {
      let lineNum = useEndLineNumber ? dm.endLineNumber : dm.startLineNumber;
      message =
        "RUNTIME " +
        errorTypeStr +
        ": '" +
        dm.fileName +
        "' line " +
        lineNum +
        ": " +
        message;
    } else if (!this.state.currentPointer.isNull) {
      message =
        "RUNTIME " +
        errorTypeStr +
        ": (" +
        this.state.currentPointer +
        "): " +
        message;
    } else {
      message = "RUNTIME " + errorTypeStr + ": " + message;
    }

    this.state.AddError(message, isWarning, raised);

    // In a broken state don't need to know about any other errors.
    if (!isWarning) this.state.ForceEnd();
  }

  public Assert(condition: boolean, message: string | null = null) {
    if (condition == false) {
      if (message == null) {
        message = "Story assert";
      }

      throw new Error(message + " " + this.currentDebugMetadata);
    }
  }

  get currentDebugMetadata(): DebugMetadata | null {
    let dm: DebugMetadata | null;

    let pointer = this.state.currentPointer;
    if (!pointer.isNull && pointer.Resolve() !== null) {
      dm = pointer.Resolve()!.debugMetadata;
      if (dm !== null) {
        return dm;
      }
    }

    for (let i = this.state.callStack.elements.length - 1; i >= 0; --i) {
      pointer = this.state.callStack.elements[i]!.currentPointer;
      if (!pointer.isNull && pointer.Resolve() !== null) {
        dm = pointer.Resolve()!.debugMetadata;
        if (dm !== null) {
          return dm;
        }
      }
    }

    for (let i = this.state.outputStream.length - 1; i >= 0; --i) {
      let outputObj = this.state.outputStream[i];
      dm = outputObj!.debugMetadata;
      if (dm !== null) {
        return dm;
      }
    }

    return null;
  }

  get mainContentContainer() {
    if (this._temporaryEvaluationContainer) {
      return this._temporaryEvaluationContainer;
    } else {
      return this._mainContentContainer;
    }
  }

  /**
   * `_mainContentContainer` is almost guaranteed to be set in the
   * constructor, unless the json is malformed.
   */
  private _mainContentContainer!: Container;
  private _listDefinitions: ListDefinitionsOrigin | null = null;
  /** Names declared with `const` — see where `rootObject["constants"]` is read. */
  private _constantNames: Set<string> = new Set<string>();
  get constantNames(): Set<string> {
    return this._constantNames;
  }

  /** A story over this one's compiled content, list and struct definitions
   *  and constant names, with no state until its `ResetState`. Stories over
   *  one content run apart: each has its own globals, call stack and
   *  handlers. */
  CopyWithOwnState(): Story {
    const copy = new Story(this._mainContentContainer, null, null);
    copy._listDefinitions = this._listDefinitions;
    copy._structDefinitions = this._structDefinitions;
    copy._constantNames = this._constantNames;
    return copy;
  }
  private _structDefinitions: Record<string, any> | null = null;

  private _externals: Map<string, Story.ExternalFunctionDef>;
  private _variableObservers: Map<string, Story.VariableObserver[]> | null =
    null;
  private _hasValidatedExternals: boolean = false;

  private _temporaryEvaluationContainer: Container | null = null;

  /**
   * `state` is almost guaranteed to be set in the constructor, unless
   * using the compiler-specific constructor which will likely not be used in
   * the real world.
   */
  private _state!: StoryState;

  /** True while the state is the one `ResetState` built and nothing has run
   *  against it yet. See {@link stateIsPristine}. */
  private _stateIsPristine: boolean = false;

  private _asyncContinueActive: boolean = false;

  private _recursiveContinueCount: number = 0;

  private _profiler: any | null = null; // TODO: Profiler
}

export namespace Story {
  export interface EvaluateFunctionTextOutput {
    returned: any;
    output: string;
  }

  export interface ExternalFunctionDef {
    function: ExternalFunction;
  }

  export type VariableObserver = (variableName: string, newValue: any) => void;
  export type ExternalFunction = (...args: any) => any;
}
