import { InkObject } from "./Object";
import type { CallStack } from "./CallStack";
import { ControlCommand } from "./ControlCommand";
import {
  Value,
  StringValue,
  IntValue,
  FloatValue,
  BoolValue,
  VariablePointerValue,
  ObjectValue,
  AbstractValue,
  MultiValue,
  NullValue,
  SymbolValue,
} from "./Value";
import { Void } from "./Void";
import { oneValue, spreadCallArgs } from "./CallArgs";
import { Tag } from "./Tag";
import { NativeFunctionCall } from "./NativeFunctionCall";
import {
  BUILTIN_ITER_TAG,
  GLOBALS_PROXY_TAG,
  firstMissingStdLibArg,
  isPureNumberStdLibOp,
  isStdLibFunctionName,
  isStdLibNamespaceName,
  luauStringToBytes,
  luauTypeOf,
  lookupAnyStdLib,
  stdLibRequiredArgs,
  stepBuiltinIterator,
  unwrapArgsForPureStdLibFn,
  type StdLibEntry,
} from "./StdLib";
import { callBuiltinMethod, METHOD_PREFIX } from "./MethodDispatch";
import { drawStoryRandom } from "./StoryRandom";
import { luauRuntimeError } from "./StoryException";
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

export interface FunctionTarget {
  readonly variadic: boolean;
  readonly bindings: number;
}

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
  const popCount = (userArityVal.value ?? 0) + (target.variadic ? 1 : 0);
  const userArgs: AbstractValue[] = [];
  for (let i = 0; i < popCount; i++) {
    userArgs.unshift(story.state.PopEvaluationStack() as AbstractValue);
  }
  let idx = 0;
  while (upvalsMap.has(String(idx))) {
    const v = upvalsMap.get(String(idx));
    if (v) story.state.PushEvaluationStack(v);
    idx++;
  }
  for (const a of userArgs) story.state.PushEvaluationStack(a);
  return target;
}

function luauIndexTargetError(v: unknown, key: unknown): string | null {
  if (v == null || v instanceof NullValue || v instanceof Void) {
    return luauIndexError("nil", key);
  }
  if (
    v instanceof BoolValue ||
    v instanceof IntValue ||
    v instanceof FloatValue ||
    isFunctionReference(v) ||
    (v instanceof ObjectValue &&
      ((v.value as Map<string, unknown>)?.has("__closure_fn") ||
        (v.value as Map<string, unknown>)?.has("__stdlib_fn")))
  ) {
    return luauIndexError(luauTypeOf(v), key);
  }
  return null;
}

function luauIndexError(baseType: string, key: unknown): string {
  const keyText =
    typeof key === "string"
      ? key
      : key instanceof StringValue
        ? key.value
        : null;
  return keyText != null && luauStringToBytes(keyText).length <= 64
    ? `attempt to index ${baseType} with '${keyText.split("\0", 1)[0]}'`
    : `attempt to index ${baseType} with ${luauTypeOf(key)}`;
}

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

function indexThroughMetatable(
  story: any,
  base: any,
  keyStr: string,
  key: AbstractValue | null = null,
  depth: number = 0,
): AbstractValue | null {
  const MAX_DEPTH = 32;
  if (depth > MAX_DEPTH) return null;
  if (!(base instanceof ObjectValue)) return null;
  const direct = base.value?.get(keyStr);
  if (direct != null) return direct as AbstractValue;
  const indexFn = lookupMetamethod(base, "__index");
  if (indexFn == null) return null;
  if (isMetamethodFunction(indexFn)) {
    const results = story.CallLuauFunction(indexFn, [
      base,
      key ?? new StringValue(keyStr),
    ]);
    return oneValue((results[0] as AbstractValue) ?? null);
  }
  if (indexFn instanceof ObjectValue) {
    return indexThroughMetatable(story, indexFn, keyStr, key, depth + 1);
  }
  const indexError = luauIndexTargetError(indexFn, key ?? keyStr);
  if (indexError) throw luauRuntimeError(indexError);
  return null;
}

function isMetamethodFunction(v: unknown): boolean {
  return luauTypeOf(v) === "function";
}

export function isFunctionReference(v: unknown): boolean {
  return v instanceof SymbolValue;
}

export function openVariablePointer(
  callStack: CallStack,
  name: string,
): VariablePointerValue {
  let contextIdx = callStack.ContextForVariableNamed(name);
  const slotValue =
    contextIdx > 0 ? callStack.GetTemporaryVariableWithName(name, contextIdx) : null;
  if (slotValue instanceof VariablePointerValue) {
    return slotValue;
  }
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

export function rootSlotCell(
  scope: Map<string, unknown>,
  name: string,
  slot: string,
): VariablePointerValue | null | undefined {
  const cell = scope.get(slot);
  if (cell instanceof VariablePointerValue) return cell;
  const legacy = scope.get(`${name}$0`);
  if (legacy instanceof VariablePointerValue) return legacy;
  if (!scope.has(name)) return null;
  const prefix = `${name}$`;
  for (const key of scope.keys()) {
    if (key.startsWith(prefix)) return null;
  }
  return undefined;
}

export function keepLegacyRootBinding(callStack: CallStack, name: string): void {
  const root = callStack.elements[0];
  if (!root || callStack.elements.length !== 1 || root.temporaryScopes.length !== 1) {
    return;
  }
  const scope = root.temporaryScopes[0]!;
  if (!scope.has(name)) return;
  const prefix = `${name}$`;
  for (const key of scope.keys()) {
    if (key.startsWith(prefix)) return;
  }
  callStack.SetTemporaryVariable(`${name}$0`, openVariablePointer(callStack, name), true, 1);
}

export function rootSlotPointer(
  callStack: CallStack,
  slot: string,
): VariablePointerValue {
  const name = slot.slice(0, slot.indexOf("$"));
  const root = callStack.elements[0];
  const cell = root ? rootSlotCell(root.temporaryScopes[0]!, name, slot) : null;
  if (cell === undefined) return openVariablePointer(callStack, name);
  return cell ?? rootGlobalPointer(name);
}

export function rootGlobalPointer(name: string): VariablePointerValue {
  return new VariablePointerValue(name, 0);
}

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

function sameLuauFunctionValue(a: any, b: any): boolean {
  if (a == null || b == null) return false;
  const rawA = (a as { value?: unknown }).value;
  const rawB = (b as { value?: unknown }).value;
  if (typeof rawA === "number" || typeof rawB === "number") {
    return rawA === rawB;
  }
  if (a === b) return true;
  if (a instanceof ObjectValue && b instanceof ObjectValue) {
    if (a.value === b.value) return true;
    const tagA = (a.value as Map<string, AbstractValue>)?.get("__stdlib_fn");
    const tagB = (b.value as Map<string, AbstractValue>)?.get("__stdlib_fn");
    return (
      tagA instanceof StringValue &&
      tagB instanceof StringValue &&
      tagA.value === tagB.value
    );
  }
  if (a instanceof SymbolValue && b instanceof SymbolValue) {
    return a.ref.Equals(b.ref);
  }
  return (
    ["string", "boolean"].includes(typeof rawA) &&
    typeof rawA === typeof rawB &&
    rawA === rawB
  );
}

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
    args.length < stdLibRequiredArgs(entry) &&
    !(entry as { validatesArgs?: boolean }).validatesArgs
  ) {
    const short = tag.value!.slice(tag.value!.lastIndexOf(".") + 1);
    story.Error(`missing argument #${args.length + 1} to '${short}'`);
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
  if (metaName === "__eq" && !(lhs instanceof ObjectValue && rhs instanceof ObjectValue)) {
    return null;
  }
  if (!(lhs instanceof ObjectValue) && !(rhs instanceof ObjectValue)) {
    return null;
  }
  if (
    (metaName === "__eq" || metaName === "__lt" || metaName === "__le") &&
    luauTypeOf(lhs) !== luauTypeOf(rhs)
  ) {
    return null;
  }
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
    handler = sameComparisonHandler(callLhs, callRhs, metaName);
    if (handler == null) {
      return lhs.value === rhs.value ? new BoolValue(!invertEq) : null;
    }
  } else if (metaName === "__lt" || metaName === "__le") {
    handler = sameComparisonHandler(callLhs, callRhs, metaName);
    if (handler == null && metaName === "__le") {
      const lt = sameComparisonHandler(callRhs, callLhs, "__lt");
      if (lt == null) return null;
      const results = story.CallLuauFunction(lt, [callRhs, callLhs]) as
        | AbstractValue[]
        | null;
      const first = oneValue((results && results[0]) || new NullValue());
      return new BoolValue(
        !(first instanceof AbstractValue ? first.isTruthy : false),
      );
    }
  } else {
    handler =
      lookupMetamethod(callLhs, metaName) ?? lookupMetamethod(callRhs, metaName);
  }
  if (handler == null) return null;
  const results = story.CallLuauFunction(handler, [callLhs, callRhs]) as
    | AbstractValue[]
    | null;
  const first = oneValue((results && results[0]) || new NullValue());
  if (metaName === "__eq" || metaName === "__lt" || metaName === "__le") {
    const truthy = first instanceof AbstractValue ? first.isTruthy : false;
    const result = invertEq ? !truthy : truthy;
    return new BoolValue(result);
  }
  return first;
}

function sameComparisonHandler(lhs: any, rhs: any, metaName: string): any {
  const handlerL = lookupMetamethod(lhs, metaName);
  const handlerR = lookupMetamethod(rhs, metaName);
  if (
    metaName === "__eq" &&
    handlerL != null &&
    lhs.metatable.value === rhs.metatable?.value
  ) {
    return handlerL;
  }
  if (
    handlerL == null ||
    handlerR == null ||
    handlerL instanceof NullValue ||
    handlerR instanceof NullValue ||
    !sameLuauFunctionValue(handlerL, handlerR)
  ) {
    return null;
  }
  return handlerL;
}

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
  const result = oneValue((results && results[0]) || new NullValue());
  if (metaName === "__len" && typeof (result as any)?.value !== "number") {
    throw luauRuntimeError("'__len' must return a number");
  }
  return result;
}

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

export function normalizeLuauCallArgs(
  story: any,
  fnValue: AbstractValue,
  args: AbstractValue[],
): AbstractValue[] {
  const bindings = bindingsOf(story, fnValue);
  if (bindings === null) return args;
  const arity = bindings.fixed;
  if (bindings.variadic) {
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

export { oneValue, spreadCallArgs };

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

function pushCallResults(story: any, results: AbstractValue[] | null): void {
  if (results && results.length === 1) {
    story.state.PushEvaluationStack(results[0]!);
  } else if (results && results.length > 1) {
    story.state.PushEvaluationStack(new MultiValue(results));
  } else {
    story.state.PushEvaluationStack(new NullValue());
  }
}

function stepIteratorCall(story: any, iterator: ObjectValue, count: number): void {
  if (count >= 0) {
    adjustCallArgs(story, count, 2);
  }
  const iterCtrl = story.state.PopEvaluationStack();
  const iterState = story.state.PopEvaluationStack();
  story.state.variablesState.WriteBarrier(iterator);
  const result = stepBuiltinIterator(
    iterator,
    iterState as AbstractValue,
    iterCtrl as AbstractValue,
  );
  story.state.PushEvaluationStack(result);
}

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
  if (!entry.pure) {
    const missing = firstMissingStdLibArg(entry, args);
    if (missing) {
      const short = name.slice(name.lastIndexOf(".") + 1);
      story.Error(`missing argument #${missing} to '${short}'`);
    }
  }
  const values = unwrapArgsForPureStdLibFn(entry, args, story, name);
  if (values.length < stdLibRequiredArgs(entry) && isPureNumberStdLibOp(name)) {
    const short = name.slice(name.lastIndexOf(".") + 1);
    story.Error(`missing argument #${values.length + 1} to '${short}'`);
  }
  pushStdLibResult(story, entry.fn(story, values));
  return true;
}

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

export const shuffleDraws: { next: (() => number) | null } = { next: null };

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

export function callVariableTarget(
  story: any,
  varName: string | null,
  callSiteArgCount: number = -1,
): FunctionTarget | null {
  const varContents =
    story.state.variablesState.GetVariableWithName(varName) ??
    (varName ? story.FlowValueNamed(varName) : null);

  if (varContents == null) {
    story.Error(
      "Tried to divert using a target from a variable that could not be found (" +
        varName +
        ")",
    );
  }
  const arranged = arrangeClosureArgs(story, varContents, callSiteArgCount);
  if (varContents instanceof ObjectValue) {
    const tag = (varContents.value as Map<string, AbstractValue>)?.get(
      BUILTIN_ITER_TAG,
    );
    if (tag != null) {
      stepIteratorCall(story, varContents, callSiteArgCount);
      return null;
    }
  }
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

  const closureTarget = extractClosureTarget(varContents, story);
  if (closureTarget !== null) {
    if (!arranged) {
      spreadLastMultiIfNonVariadic(story, closureTarget);
    }
    return closureTarget;
  }
  if (varContents instanceof ObjectValue) {
    const callHandler = lookupMetamethod(varContents, "__call");
    if (callHandler != null) {
      callThroughHandler(story, varContents, callHandler, callSiteArgCount);
      return null;
    }
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
  if (callSiteArgCount >= 0) {
    arrangeArgsFor(story, target!, callSiteArgCount);
  } else {
    spreadLastMultiIfNonVariadic(story, target);
  }
  return target;
}

export function callValueAsFunction(
  story: any,
  callSiteArgCount: number,
  methodName: string | null = null,
): void {
  const callTarget = oneValue(story.state.PopEvaluationStack());
  const arranged = arrangeClosureArgs(story, callTarget, callSiteArgCount);
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
    if (!arranged && callSiteArgCount !== 0) {
      spreadLastMultiIfNonVariadic(story, closureTarget);
    }
    return;
  }
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
  if (callTarget instanceof ObjectValue) {
    const callHandler = lookupMetamethod(callTarget, "__call");
    if (callHandler != null) {
      callThroughHandler(story, callTarget, callHandler, callSiteArgCount);
      return;
    }
  }
  const target: FunctionTarget | null = story.FunctionTargetOf(callTarget);
  if (target === null) {
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
        spreadCallArgs(nmArgs);
        pushCallResults(
          story,
          story.CallLuauFunction(nmHandler, nmArgs) as AbstractValue[] | null,
        );
        return;
      }
      for (const a of nmArgs) story.state.PushEvaluationStack(a);
      if (methodName !== null) {
        throw luauRuntimeError(
          `attempt to call missing method '${methodName}' of ${luauTypeOf(oneValue(nmReceiver ?? null))}`,
        );
      }
    }
    throw luauRuntimeError(`attempt to call a ${luauTypeOf(callTarget)} value`);
  }
  if (callSiteArgCount >= 0) {
    arrangeArgsFor(story, target, callSiteArgCount);
  } else {
    spreadLastMultiIfNonVariadic(story, target);
  }
  story.EnterFunction(target);
}

function newindexThroughMetatable(
  story: any,
  base: any,
  key: InkObject | null,
  keyStr: string | null,
  newVal: AbstractValue,
  depth: number = 0,
): boolean {
  const MAX_DEPTH = 32;
  if (depth > MAX_DEPTH) return false;
  if (!(base instanceof ObjectValue)) return false;
  if (keyStr !== null && base.value?.has(keyStr)) {
    if (depth > 0) {
      rawStore(story, base, key, keyStr, newVal);
      return true;
    }
    return false;
  }
  const newindexFn = lookupMetamethod(base, "__newindex");
  if (newindexFn == null) {
    if (depth > 0) {
      rawStore(story, base, key, keyStr, newVal);
      return true;
    }
    return false;
  }
  const passedKey =
    (key as AbstractValue | null) ?? (new NullValue() as AbstractValue);
  if (isMetamethodFunction(newindexFn)) {
    story.CallLuauFunction(newindexFn, [base, passedKey, newVal]);
    return true;
  }
  if (newindexFn instanceof ObjectValue) {
    return newindexThroughMetatable(
      story,
      newindexFn,
      key,
      keyStr,
      newVal,
      depth + 1,
    );
  }
  const indexError = luauIndexTargetError(newindexFn, key ?? keyStr);
  if (indexError) throw luauRuntimeError(indexError);
  return false;
}

function invalidKeyMessage(key: InkObject | null): string | null {
  if (key == null || key instanceof NullValue) return "table index is nil";
  const numKey = (key as { value?: unknown }).value;
  if (typeof numKey === "number" && Number.isNaN(numKey)) {
    return "table index is NaN";
  }
  return null;
}

function rawStore(
  story: any,
  base: ObjectValue,
  key: InkObject | null,
  keyStr: string | null,
  val: AbstractValue,
): void {
  if (base.isFrozen) {
    throw luauRuntimeError("attempt to modify a readonly table");
  }
  if (keyStr === null) {
    throw luauRuntimeError(invalidKeyMessage(key) ?? "table index is nil");
  }
  story.state.variablesState.WriteBarrier(base);
  if (val instanceof NullValue) {
    base.value!.delete(keyStr);
  } else {
    base.value!.set(keyStr, val);
  }
  if (story.state.variablesState.reactiveDepsEnabled) {
    story.state.variablesState.recordReactiveTableChange(base.value);
  }
}

export function tableFromPairs(
  between: readonly InkObject[],
  first: number,
): ObjectValue {
  const entries = new Map<string, AbstractValue>();
  const pairEnd = between.length - 1;
  for (let i = first; i + 1 < between.length; i += 2) {
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
    const isLast = i + 1 === pairEnd;
    if (
      isLast &&
      valObj instanceof MultiValue &&
      /^[1-9]\d*$/.test(keyObj.value)
    ) {
      const startIdx = parseInt(keyObj.value, 10);
      for (let k = 0; k < valObj.values.length; k++) {
        const spreadVal = valObj.values[k]!;
        if (spreadVal instanceof NullValue) continue;
        entries.set(String(startIdx + k), spreadVal);
      }
    } else {
      if (valObj instanceof MultiValue) {
        valObj = valObj.values[0] ?? new NullValue();
      }
      if (valObj instanceof NullValue) {
        entries.delete(keyObj.value);
      } else {
        entries.set(keyObj.value, valObj);
      }
    }
  }
  return new ObjectValue(entries);
}

function stringLibraryMember(key: string): ObjectValue | null {
  const libName = `string.${key}`;
  if (!isStdLibFunctionName(libName)) return null;
  const marker = new Map<string, AbstractValue>();
  marker.set("__stdlib_fn", new StringValue(libName));
  return new ObjectValue(marker);
}

export function indexValue(
  story: any,
  indexBase: InkObject | null,
  indexKey: InkObject | null,
): InkObject {
  indexBase = oneValue(indexBase);
  indexKey = oneValue(indexKey);
  let resolved: InkObject | null = null;
  const keyStr = luauMapKeyString(indexKey);
  if (
    indexBase instanceof ObjectValue &&
    indexBase.value?.has(GLOBALS_PROXY_TAG)
  ) {
    return (
      story.state.variablesState.GetGlobalVariableValue(keyStr) ??
      new NullValue()
    );
  }
  {
    const idxErr = luauIndexTargetError(indexBase, indexKey);
    if (idxErr) {
      throw luauRuntimeError(idxErr);
    }
  }
  if (indexBase instanceof ObjectValue) {
    if (story.state.variablesState.reactiveDepsEnabled) {
      story.state.variablesState.recordReactiveTableRead(indexBase.value!);
    }
    const direct = indexBase.value?.get(keyStr) ?? null;
    if (direct != null) {
      resolved = direct;
    } else {
      resolved = indexThroughMetatable(
        story,
        indexBase,
        keyStr,
        asOrNull(indexKey, AbstractValue),
      );
    }
  } else if (indexBase instanceof StringValue) {
    const intKey = asOrNull(indexKey, IntValue);
    if (intKey !== null && indexBase.value !== null) {
      const i = (intKey.value ?? 0) - 1;
      const ch =
        i >= 0 && i < indexBase.value.length ? indexBase.value[i] : "";
      resolved = new StringValue(ch ?? "");
    } else if (indexKey instanceof StringValue) {
      resolved = stringLibraryMember(keyStr);
    }
  }
  if (resolved === null) {
    resolved = new NullValue();
  }
  return resolved;
}

export function storeIndex(
  story: any,
  storeBase: InkObject | null,
  storeKey: InkObject | null,
  storeValue: InkObject | null,
): void {
  storeBase = oneValue(storeBase);
  storeKey = oneValue(storeKey);
  storeValue = oneValue(storeValue);
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
    const invalidKey = invalidKeyMessage(storeKey);
    const keyStr = invalidKey === null ? luauMapKeyString(storeKey!) : null;
    const val = asOrNull(storeValue, AbstractValue);
    if (storeBase.value && val !== null) {
      if (newindexThroughMetatable(story, storeBase, storeKey, keyStr, val)) {
        return;
      }
      rawStore(story, storeBase, storeKey, keyStr, val);
    } else if (invalidKey !== null) {
      throw luauRuntimeError(invalidKey);
    }
  } else {
    throw luauRuntimeError(luauIndexError(luauTypeOf(storeBase), storeKey));
  }
}

export function readVariable(story: any, name: string | null): InkObject {
  let foundValue: InkObject | null = null;
  if (name === "_G") {
    const proxyMap = new Map<string, AbstractValue>();
    proxyMap.set(GLOBALS_PROXY_TAG, new BoolValue(true));
    return new ObjectValue(proxyMap);
  }

  if (story.state.variablesState.reactiveDepsEnabled && name) {
    story.state.variablesState.recordReactiveGlobalRead(name.split(".")[0]!);
  }

  foundValue = story.state.variablesState.GetVariableWithName(name);

  let dottedIndexError: string | null = null;
  let dottedResolvedToNil = false;
  if (foundValue == null && name && name.includes(".")) {
    const segs = name.split(".");
    let walkStart = 1;
    let cur: unknown;
    if (segs[0] === "_G" && segs.length > 1) {
      cur = story.state.variablesState.GetGlobalVariableValue(segs[1]!);
      walkStart = 2;
      if (cur == null) {
        if (segs.length > 2) {
          dottedIndexError = luauIndexError("nil", segs[2]);
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
        const idxErr = luauIndexTargetError(cur, seg);
        if (idxErr) {
          dottedIndexError = idxErr;
          cur = null;
          break;
        }
        if (cur instanceof ObjectValue) {
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
          if (i < segs.length - 1) {
            dottedIndexError = luauIndexError("nil", segs[i + 1]);
          }
          cur = null;
          break;
        }
        const obj = (cur as any)?.value;
        if (obj instanceof Map) {
          cur = obj.get(seg) ?? null;
          if (cur == null) {
            if (i < segs.length - 1) {
              dottedIndexError = luauIndexError("nil", segs[i + 1]);
            }
            break;
          }
        } else {
          cur = cur instanceof StringValue ? stringLibraryMember(seg) : null;
          if (cur != null) continue;
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

  if (foundValue == null && name) {
    foundValue = story.FlowValueNamed(name);
  }

  if (foundValue == null && name && isStdLibFunctionName(name)) {
    const marker = new Map<string, AbstractValue>();
    marker.set("__stdlib_fn", new StringValue(name));
    foundValue = new ObjectValue(marker);
  }

  if (foundValue == null) {
    if (dottedIndexError) {
      throw luauRuntimeError(dottedIndexError);
    }
    if (!dottedResolvedToNil && name && name.includes(".")) {
      const segs = name.split(".");
      for (let cut = segs.length - 1; cut >= 1; cut--) {
        if (isStdLibFunctionName(segs.slice(0, cut).join("."))) {
          throw luauRuntimeError(luauIndexError("function", segs[cut]));
        }
      }
      if (isStdLibNamespaceName(segs[0]!)) {
        if (segs.length > 2) {
          throw luauRuntimeError(luauIndexError("nil", segs[2]));
        }
      } else if (story.FlowValueNamed(segs[0]!)) {
        throw luauRuntimeError(luauIndexError("function", segs[1]));
      } else {
        throw luauRuntimeError(luauIndexError("nil", segs[1]));
      }
    }
    foundValue = new NullValue();
  }
  return foundValue;
}

const RANDOM_METHOD = `${METHOD_PREFIX}random`;

export function callNativeFunction(
  story: any,
  func: NativeFunctionCall,
  funcParams: InkObject[],
  callArgs = false,
): InkObject | null {
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
        const args = [...funcParams] as AbstractValue[];
        spreadCallArgs(args);
        const results = story.CallLuauFunction(
          member as AbstractValue,
          args,
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
  if (callArgs) {
    const arity = func.numberOfParameters;
    funcParams = funcParams.slice(0, arity);
    while (funcParams.length < arity) funcParams.push(new Void());
  }
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
  const table = fname === "LEN" && operand instanceof ObjectValue ? operand : null;
  const hint = table ? (table.value as any)?.__luauBoundary : undefined;
  if (table) {
    story.state.variablesState.PrepareTableWrite?.(table);
  }
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

export function packTuple(story: any, n: number): void {
  const values: AbstractValue[] = [];
  for (let i = 0; i < n; i++) {
    const v = story.state.PopEvaluationStack() as AbstractValue;
    if (i === 0 && v instanceof MultiValue) {
      for (let k = v.values.length - 1; k >= 0; k--) {
        values.unshift(v.values[k]!);
      }
    } else if (i === 0 && v instanceof Void) {
    } else if (v instanceof MultiValue) {
      values.unshift(v.values[0] ?? new NullValue());
    } else if (v instanceof Void) {
      values.unshift(new NullValue());
    } else {
      values.unshift(v);
    }
  }
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

export function unpackTuple(story: any, n: number): void {
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

export function shortCircuitDecides(story: any, op: "and" | "or"): boolean {
  let lhs = story.state.PeekEvaluationStack() as AbstractValue;
  if (lhs instanceof MultiValue || lhs instanceof Void) {
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

export function popLuauCondition(story: any): boolean {
  return isLuauTruthy(oneValue(story.state.PopEvaluationStack() as AbstractValue));
}

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

  state.PopFromOutputStream(outputCountConsumed);
  let sb = new StringBuilder();
  for (let strVal of contentStackForTag.reverse()) {
    sb.Append(strVal.toString());
  }
  state.PushEvaluationStack(new Tag(clean(sb.toString())));
}

export function captureString(state: any): StringValue {
  let contentStackForString: InkObject[] = [];
  let contentToRetain: InkObject[] = [];

  let outputCountConsumed = 0;
  for (let i = state.outputStream.length - 1; i >= 0; --i) {
    let obj = state.outputStream[i];

    outputCountConsumed++;

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

  state.PopFromOutputStream(outputCountConsumed);

  for (let rescuedTag of contentToRetain) state.PushToOutputStream(rescuedTag);

  contentStackForString = contentStackForString.reverse();

  let sb = new StringBuilder();
  for (let c of contentStackForString) {
    sb.Append(c.toString());
  }
  return new StringValue(sb.toString());
}
