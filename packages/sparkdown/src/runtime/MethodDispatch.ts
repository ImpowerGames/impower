import { InkObject } from "./Object";
import { ambientReads } from "./AmbientReads";
import {
  AbstractValue,
  BoolValue,
  FloatValue,
  IntValue,
  MultiValue,
  NullValue,
  ObjectValue,
  StringValue,
} from "./Value";
import { Void } from "./Void";
import { StoryException } from "./StoryException";
import { oneValue, spreadCallArgs } from "./CallArgs";
import { coerceNumber, luauTypeOf } from "./StdLib";
import { executeLuaPattern, luaPatternToJs } from "./LuaPatterns";

export const METHOD_PREFIX = "__method_";

export type BuiltinMethod = (params: InkObject[]) => InkObject | null;

function NIL(): InkObject {
  return new NullValue();
}

function asString(
  v: InkObject | undefined,
  method: string,
  position: string,
): string {
  if (!(v instanceof StringValue)) {
    throw new StoryException(
      `:${method} expected ${position} to be a string`,
    );
  }
  return v.value ?? "";
}

function asTable(
  v: InkObject | undefined,
  method: string,
  position: string,
): Map<string, AbstractValue> {
  if (!(v instanceof ObjectValue)) {
    throw new StoryException(
      `:${method} expected ${position} to be a table`,
    );
  }
  return v.value ?? new Map();
}

export function checkNumberArg(
  v: any,
  index: number,
  name: string,
  optional: true,
): number | undefined;
export function checkNumberArg(v: any, index: number, name: string): number;
export function checkNumberArg(
  v: any,
  index: number,
  name: string,
  optional = false,
): number | undefined {
  const missing =
    v === undefined ||
    v instanceof Void ||
    (v instanceof MultiValue && v.values.length === 0);
  const raw = v instanceof MultiValue ? v.values[0] : v;
  if (optional && (missing || luauTypeOf(raw) === "nil")) {
    return undefined;
  }
  if (missing) {
    throw new StoryException(
      `missing argument #${index} to '${name}' (number expected)`,
    );
  }
  const n = coerceNumber(raw);
  if (n === null) {
    throw new StoryException(
      `invalid argument #${index} to '${name}' (number expected, got ${luauTypeOf(raw)})`,
    );
  }
  return n;
}

function arrayPortion(t: Map<string, AbstractValue>): AbstractValue[] {
  const arr: AbstractValue[] = [];
  for (let i = 1; ; i++) {
    const v = t.get(String(i));
    if (v == null) break;
    arr.push(v);
  }
  return arr;
}

function arrayToObject(arr: AbstractValue[]): ObjectValue {
  const map = new Map<string, AbstractValue>();
  for (let i = 0; i < arr.length; i++) {
    map.set(String(i + 1), arr[i]!);
  }
  return new ObjectValue(map);
}

function rebuildTable(
  arr: AbstractValue[],
  original: Map<string, AbstractValue>,
): ObjectValue {
  const next = new Map<string, AbstractValue>();
  for (let i = 0; i < arr.length; i++) {
    next.set(String(i + 1), arr[i]!);
  }
  for (const [k, v] of original.entries()) {
    if (!/^\d+$/.test(k)) {
      next.set(k, v);
    }
  }
  return new ObjectValue(next);
}

function keyToValue(k: string): AbstractValue {
  if (/^-?\d+$/.test(k)) return new IntValue(parseInt(k, 10));
  return new StringValue(k);
}

function valuesEqual(
  a: AbstractValue | null | undefined,
  b: AbstractValue | null | undefined,
): boolean {
  if (a == null || b == null) return a == null && b == null;
  if (
    (a instanceof IntValue || a instanceof FloatValue) &&
    (b instanceof IntValue || b instanceof FloatValue)
  ) {
    return Number(a.value) === Number(b.value);
  }
  if (a.valueType !== b.valueType) return false;
  return (
    (a as unknown as Value<any>).value === (b as unknown as Value<any>).value
  );
}

type Value<T> = { value: T | null };

function normalizeRange(
  i: number,
  j: number | undefined,
  len: number,
): [number, number] {
  const jEff = j === undefined ? len : j;
  const start = i < 0 ? Math.max(len + i, 0) : Math.max(i - 1, 0);
  const end = jEff < 0 ? Math.max(len + jEff + 1, 0) : Math.min(jEff, len);
  return [start, Math.max(end, start)];
}

function methodUpper(params: InkObject[]): InkObject {
  return new StringValue(asString(params[0], "upper", "receiver").toUpperCase());
}

function methodLower(params: InkObject[]): InkObject {
  return new StringValue(asString(params[0], "lower", "receiver").toLowerCase());
}

function methodTrim(params: InkObject[]): InkObject {
  return new StringValue(asString(params[0], "trim", "receiver").trim());
}

function methodTrimstart(params: InkObject[]): InkObject {
  return new StringValue(
    asString(params[0], "trimstart", "receiver").trimStart(),
  );
}

function methodTrimend(params: InkObject[]): InkObject {
  return new StringValue(
    asString(params[0], "trimend", "receiver").trimEnd(),
  );
}

function methodStartswith(params: InkObject[]): InkObject {
  const s = asString(params[0], "startswith", "receiver");
  const prefix = asString(params[1], "startswith", "prefix");
  return new BoolValue(s.startsWith(prefix));
}

function methodEndswith(params: InkObject[]): InkObject {
  const s = asString(params[0], "endswith", "receiver");
  const suffix = asString(params[1], "endswith", "suffix");
  return new BoolValue(s.endsWith(suffix));
}

function methodPadstart(params: InkObject[]): InkObject {
  const s = asString(params[0], "padstart", "receiver");
  const len = checkNumberArg(params[1], 1, "padstart");
  const ch =
    params[2] instanceof StringValue && params[2].value
      ? params[2].value
      : " ";
  return new StringValue(s.padStart(len, ch));
}

function methodPadend(params: InkObject[]): InkObject {
  const s = asString(params[0], "padend", "receiver");
  const len = checkNumberArg(params[1], 1, "padend");
  const ch =
    params[2] instanceof StringValue && params[2].value
      ? params[2].value
      : " ";
  return new StringValue(s.padEnd(len, ch));
}

function methodRep(params: InkObject[]): InkObject {
  const s = asString(params[0], "rep", "receiver");
  const n = checkNumberArg(params[1], 1, "rep");
  if (n <= 0) return new StringValue("");
  const sep = params[2] instanceof StringValue ? params[2].value ?? "" : "";
  if (sep === "") return new StringValue(s.repeat(n));
  const parts: string[] = [];
  for (let i = 0; i < n; i++) parts.push(s);
  return new StringValue(parts.join(sep));
}

function methodGsub(params: InkObject[]): InkObject {
  const s = asString(params[0], "gsub", "receiver");
  const old = asString(params[1], "gsub", "old");
  const replacement = asString(params[2], "gsub", "new");
  if (old === "") return new StringValue(s);
  return new StringValue(s.split(old).join(replacement));
}

function methodMatch(params: InkObject[]): InkObject {
  const s = asString(params[0], "match", "receiver");
  const pattern = asString(params[1], "match", "pattern");
  let compiled;
  try {
    compiled = luaPatternToJs(pattern);
  } catch {
    return NIL();
  }
  const matched = executeLuaPattern(compiled, s, 0);
  if (!matched) return NIL();
  if (compiled.captureCount === 0) {
    return new StringValue(
      s.slice(matched.index, matched.index + matched.length),
    );
  }
  const first = matched.captures[0];
  if (first == null) return NIL();
  if (typeof first === "number") return new IntValue(first);
  return new StringValue(first);
}

function methodSplit(params: InkObject[]): InkObject {
  const s = asString(params[0], "split", "receiver");
  const sep =
    params[1] instanceof StringValue ? params[1].value ?? "," : ",";
  if (sep === "") {
    return arrayToObject([new StringValue(s)]);
  }
  const parts = s.split(sep);
  return arrayToObject(parts.map((p) => new StringValue(p)));
}

function methodLen(params: InkObject[]): InkObject {
  const r = params[0];
  if (r instanceof StringValue) return new IntValue((r.value ?? "").length);
  if (r instanceof ObjectValue) return new IntValue((r.value ?? new Map()).size);
  throw new StoryException(":len called on non-string non-table");
}

function methodReverse(params: InkObject[]): InkObject {
  const r = params[0];
  if (r instanceof StringValue) {
    return new StringValue((r.value ?? "").split("").reverse().join(""));
  }
  if (r instanceof ObjectValue) {
    const arr = arrayPortion(r.value ?? new Map());
    arr.reverse();
    return rebuildTable(arr, r.value ?? new Map());
  }
  throw new StoryException(":reverse called on non-string non-table");
}

function methodAt(params: InkObject[]): InkObject {
  const r = params[0];
  const i = checkNumberArg(params[1], 1, "at");
  if (r instanceof StringValue) {
    const s = r.value ?? "";
    const idx = i < 0 ? s.length + i : i - 1;
    if (idx < 0 || idx >= s.length) return NIL();
    return new StringValue(s[idx]!);
  }
  if (r instanceof ObjectValue) {
    const arr = arrayPortion(r.value ?? new Map());
    const idx = i < 0 ? arr.length + i : i - 1;
    if (idx < 0 || idx >= arr.length) return NIL();
    return arr[idx]!;
  }
  throw new StoryException(":at called on non-string non-table");
}

function methodSub(params: InkObject[]): InkObject {
  const r = params[0];
  const i = checkNumberArg(params[1], 1, "sub");
  const j = checkNumberArg(params[2], 2, "sub", true);
  if (r instanceof StringValue) {
    const s = r.value ?? "";
    const [start, end] = normalizeRange(i, j, s.length);
    return new StringValue(s.substring(start, end));
  }
  if (r instanceof ObjectValue) {
    const arr = arrayPortion(r.value ?? new Map());
    const [start, end] = normalizeRange(i, j, arr.length);
    return arrayToObject(arr.slice(start, end));
  }
  throw new StoryException(":sub called on non-string non-table");
}

function methodFind(params: InkObject[]): InkObject {
  const r = params[0];
  if (r instanceof StringValue) {
    const s = r.value ?? "";
    const needle = asString(params[1], "find", "needle");
    let init = 1;
    const initParam = params[2];
    if (initParam instanceof IntValue || initParam instanceof FloatValue) {
      init = Math.trunc(initParam.value ?? 1);
    } else if (initParam instanceof StringValue) {
      const n = parseFloat(initParam.value ?? "");
      if (!Number.isNaN(n)) init = Math.trunc(n);
    }
    if (init < 0) init = Math.max(s.length + init + 1, 1);
    else if (init === 0) init = 1;
    if (init > s.length + 1) return NIL();
    const plainParam = params[3];
    const plain =
      plainParam != null &&
      !(plainParam instanceof NullValue) &&
      (plainParam as any).value !== false;
    if (plain) {
      const idx = s.indexOf(needle, init - 1);
      if (idx < 0) return NIL();
      return new MultiValue([
        new IntValue(idx + 1),
        new IntValue(idx + needle.length),
      ]);
    }
    let compiled;
    try {
      compiled = luaPatternToJs(needle);
    } catch (e) {
      throw new StoryException(`string.find: ${(e as Error).message}`);
    }
    const matched = executeLuaPattern(compiled, s, init - 1);
    if (!matched) return NIL();
    const captures: AbstractValue[] = matched.captures.map((c) => {
      if (c == null) return new NullValue();
      if (typeof c === "number") return new IntValue(c);
      return new StringValue(c);
    });
    return new MultiValue([
      new IntValue(matched.index + 1),
      new IntValue(matched.index + matched.length),
      ...captures,
    ]);
  }
  if (r instanceof ObjectValue) {
    const arr = arrayPortion(r.value ?? new Map());
    const needle = params[1] as AbstractValue;
    for (let i = 0; i < arr.length; i++) {
      if (valuesEqual(arr[i]!, needle)) return new IntValue(i + 1);
    }
    return NIL();
  }
  throw new StoryException(":find called on non-string non-table");
}

function methodClone(params: InkObject[]): InkObject {
  const t = asTable(params[0], "clone", "receiver");
  const next = new Map<string, AbstractValue>();
  for (const [k, v] of t.entries()) next.set(k, v);
  return new ObjectValue(next);
}

function methodInsert(params: InkObject[]): InkObject {
  const t = asTable(params[0], "insert", "receiver");
  const arr = arrayPortion(t);
  if (params.length === 2) {
    arr.push(params[1] as AbstractValue);
  } else if (params.length === 3) {
    const pos = checkNumberArg(params[1], 1, "insert");
    const val = params[2] as AbstractValue;
    const idx = Math.max(0, Math.min(pos - 1, arr.length));
    arr.splice(idx, 0, val);
  } else {
    throw new StoryException(":insert expects 1 or 2 arguments after receiver");
  }
  return rebuildTable(arr, t);
}

function methodRemove(params: InkObject[]): InkObject {
  const t = asTable(params[0], "remove", "receiver");
  const arr = arrayPortion(t);
  const given = checkNumberArg(params[1], 1, "remove", true);
  if (arr.length === 0) {
    return new ObjectValue(new Map(t));
  }
  const pos = given ?? arr.length;
  if (pos < 1 || pos > arr.length) {
    throw new StoryException(`:remove index ${pos} out of range`);
  }
  arr.splice(pos - 1, 1);
  return rebuildTable(arr, t);
}

function methodConcat(params: InkObject[]): InkObject {
  const t = asTable(params[0], "concat", "receiver");
  const arr = arrayPortion(t);
  const sep = params[1] instanceof StringValue ? params[1].value ?? "" : "";
  const i = checkNumberArg(params[2], 2, "concat", true) ?? 1;
  const j = checkNumberArg(params[3], 3, "concat", true) ?? arr.length;
  const [start, end] = normalizeRange(i, j, arr.length);
  const slice = arr.slice(start, end);
  return new StringValue(
    slice.map((v) => (v == null ? "" : v.toString())).join(sep),
  );
}

function methodSort(params: InkObject[]): InkObject {
  const t = asTable(params[0], "sort", "receiver");
  const arr = arrayPortion(t);
  const sorted = arr.slice().sort((a, b) => compareValues(a, b, "sort"));
  return rebuildTable(sorted, t);
}

function methodSortby(params: InkObject[]): InkObject {
  const t = asTable(params[0], "sortby", "receiver");
  const key = asString(params[1], "sortby", "key");
  const arr = arrayPortion(t);
  const sorted = arr.slice().sort((a, b) => {
    if (!(a instanceof ObjectValue) || !(b instanceof ObjectValue)) {
      throw new StoryException(":sortby requires an array of records");
    }
    const av = a.value?.get(key);
    const bv = b.value?.get(key);
    if (av == null || bv == null) {
      throw new StoryException(`:sortby missing key '${key}' on a record`);
    }
    return compareValues(av, bv, "sortby");
  });
  return rebuildTable(sorted, t);
}

function compareValues(
  a: AbstractValue,
  b: AbstractValue,
  method: string,
): number {
  const aIsNum = a instanceof IntValue || a instanceof FloatValue;
  const bIsNum = b instanceof IntValue || b instanceof FloatValue;
  if (aIsNum && bIsNum) {
    const av = Number((a as Value<number>).value);
    const bv = Number((b as Value<number>).value);
    return av < bv ? -1 : av > bv ? 1 : 0;
  }
  if (a instanceof StringValue && b instanceof StringValue) {
    const av = a.value ?? "";
    const bv = b.value ?? "";
    return av < bv ? -1 : av > bv ? 1 : 0;
  }
  throw new StoryException(
    `:${method} cannot compare ${a?.constructor.name} and ${b?.constructor.name}`,
  );
}

function methodMin(params: InkObject[]): InkObject {
  const t = asTable(params[0], "min", "receiver");
  const arr = arrayPortion(t);
  if (arr.length === 0) return NIL();
  let best = arr[0]!;
  for (let i = 1; i < arr.length; i++) {
    if (compareValues(arr[i]!, best, "min") < 0) best = arr[i]!;
  }
  return best;
}

function methodMax(params: InkObject[]): InkObject {
  const t = asTable(params[0], "max", "receiver");
  const arr = arrayPortion(t);
  if (arr.length === 0) return NIL();
  let best = arr[0]!;
  for (let i = 1; i < arr.length; i++) {
    if (compareValues(arr[i]!, best, "max") > 0) best = arr[i]!;
  }
  return best;
}

function methodRandom(
  params: InkObject[],
  draw: (() => number) | null = null,
): InkObject {
  const t = asTable(params[0], "random", "receiver");
  const arr = arrayPortion(t);
  if (arr.length === 0) return NIL();
  if (!draw) {
    ambientReads.count += 1;
  }
  const idx = draw
    ? draw() % arr.length
    : Math.floor(Math.random() * arr.length);
  return arr[idx]!;
}

function methodSome(params: InkObject[]): InkObject {
  const t = asTable(params[0], "some", "receiver");
  const other = asTable(params[1], "some", "other");
  const myArr = arrayPortion(t);
  const otherArr = arrayPortion(other);
  for (const v of otherArr) {
    if (myArr.some((m) => valuesEqual(m, v))) return new BoolValue(true);
  }
  return new BoolValue(false);
}

function methodEvery(params: InkObject[]): InkObject {
  const t = asTable(params[0], "every", "receiver");
  const other = asTable(params[1], "every", "other");
  const myArr = arrayPortion(t);
  const otherArr = arrayPortion(other);
  for (const v of otherArr) {
    if (!myArr.some((m) => valuesEqual(m, v))) return new BoolValue(false);
  }
  return new BoolValue(true);
}

function methodUnion(params: InkObject[]): InkObject {
  const a = arrayPortion(asTable(params[0], "union", "receiver"));
  const b = arrayPortion(asTable(params[1], "union", "other"));
  const out: AbstractValue[] = [];
  for (const v of a) {
    if (!out.some((r) => valuesEqual(r, v))) out.push(v);
  }
  for (const v of b) {
    if (!out.some((r) => valuesEqual(r, v))) out.push(v);
  }
  return arrayToObject(out);
}

function methodIntersection(params: InkObject[]): InkObject {
  const a = arrayPortion(asTable(params[0], "intersection", "receiver"));
  const b = arrayPortion(asTable(params[1], "intersection", "other"));
  const out: AbstractValue[] = [];
  for (const v of a) {
    if (
      b.some((x) => valuesEqual(x, v)) &&
      !out.some((r) => valuesEqual(r, v))
    ) {
      out.push(v);
    }
  }
  return arrayToObject(out);
}

function methodDifference(params: InkObject[]): InkObject {
  const a = arrayPortion(asTable(params[0], "difference", "receiver"));
  const b = arrayPortion(asTable(params[1], "difference", "other"));
  const out: AbstractValue[] = [];
  for (const v of a) {
    if (
      !b.some((x) => valuesEqual(x, v)) &&
      !out.some((r) => valuesEqual(r, v))
    ) {
      out.push(v);
    }
  }
  return arrayToObject(out);
}

function methodKeys(params: InkObject[]): InkObject {
  const t = asTable(params[0], "keys", "receiver");
  const out: AbstractValue[] = [];
  for (const k of t.keys()) out.push(keyToValue(k));
  return arrayToObject(out);
}

function methodValues(params: InkObject[]): InkObject {
  const t = asTable(params[0], "values", "receiver");
  const out: AbstractValue[] = [];
  for (const v of t.values()) out.push(v);
  return arrayToObject(out);
}

function methodPairs(params: InkObject[]): InkObject {
  const t = asTable(params[0], "pairs", "receiver");
  const out: AbstractValue[] = [];
  for (const [k, v] of t.entries()) {
    out.push(
      new ObjectValue(
        new Map<string, AbstractValue>([
          ["1", keyToValue(k)],
          ["2", v],
        ]),
      ),
    );
  }
  return arrayToObject(out);
}

function methodIpairs(params: InkObject[]): InkObject {
  const t = asTable(params[0], "ipairs", "receiver");
  const arr = arrayPortion(t);
  const out: AbstractValue[] = [];
  for (let i = 0; i < arr.length; i++) {
    out.push(
      new ObjectValue(
        new Map<string, AbstractValue>([
          ["1", new IntValue(i + 1)],
          ["2", arr[i]!],
        ]),
      ),
    );
  }
  return arrayToObject(out);
}

export const METHOD_DISPATCH: Record<string, BuiltinMethod> = {
  upper: methodUpper,
  lower: methodLower,
  trim: methodTrim,
  trimstart: methodTrimstart,
  trimend: methodTrimend,
  startswith: methodStartswith,
  endswith: methodEndswith,
  padstart: methodPadstart,
  padend: methodPadend,
  rep: methodRep,
  gsub: methodGsub,
  match: methodMatch,
  split: methodSplit,
  len: methodLen,
  reverse: methodReverse,
  at: methodAt,
  sub: methodSub,
  find: methodFind,
  clone: methodClone,
  insert: methodInsert,
  remove: methodRemove,
  concat: methodConcat,
  sort: methodSort,
  sortby: methodSortby,
  min: methodMin,
  max: methodMax,
  random: methodRandom,
  some: methodSome,
  every: methodEvery,
  union: methodUnion,
  intersection: methodIntersection,
  difference: methodDifference,
  keys: methodKeys,
  values: methodValues,
  pairs: methodPairs,
  ipairs: methodIpairs,
};

export function isBuiltinMethod(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(METHOD_DISPATCH, name);
}

export function callBuiltinMethod(
  fullName: string,
  params: InkObject[],
  draw: (() => number) | null = null,
): InkObject | null {
  if (!fullName.startsWith(METHOD_PREFIX)) return null;
  const methodName = fullName.slice(METHOD_PREFIX.length);
  const impl = METHOD_DISPATCH[methodName];
  if (!impl) {
    throw new StoryException(`Unknown builtin method :${methodName}`);
  }
  if (params.length > 0) {
    const args = params.slice(1);
    spreadCallArgs(args);
    params = [oneValue(params[0]!), ...args];
  }
  if (impl === methodRandom) {
    return methodRandom(params, draw);
  }
  return impl(params);
}
