import { oneValue } from "./CallArgs";
import { ControlCommand } from "./ControlCommand";
import { getPluralCategory } from "./PluralRules";
import { StepLimitExceeded, StoryException } from "./StoryException";
import { drawStoryRandom } from "./StoryRandom";
import { ambientReads } from "./AmbientReads";
import { Void } from "./Void";
import {
  ObjectValue,
  IntValue,
  FloatValue,
  BoolValue,
  AbstractValue,
  MultiValue,
  NullValue,
  StringValue,
  SymbolValue,
  Value,
  VariablePointerValue,
  functionText,
} from "./Value";
import {
  luaPatternToJs,
  executeLuaPattern,
  LuaPatternError,
  type PatternMatchResult,
} from "./LuaPatterns";

export type NumericUnary = (v: number) => number;
export type NumericBinary = (a: number, b: number) => number;
export type StdLibFn = NumericUnary | NumericBinary;

export type StateAwareStdLibFn = (story: any, args: any[]) => any | undefined;

export type PureStdLibType = "number" | "string";

export interface StdLibEntry {
  arity: number;
  pure?: boolean | PureStdLibType[];
  deprecated?: string;
  validatesArgs?: boolean;
  minArgs?: number;
  fn: StateAwareStdLibFn;
}

export type StateAwareStdLibEntry = StdLibEntry;

export const VARIADIC_ARITY = -1;

export function coerceNumber(v: any): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseLuauNumber(v);
  if (v != null && typeof v === "object" && "value" in v) {
    const raw = (v as any).value;
    if (typeof raw === "number") return raw;
    if (typeof raw === "string") return parseLuauNumber(raw);
  }
  return null;
}

export function luauNumberToString(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  if (Object.is(n, -0)) return "-0";
  return String(n);
}

function checkBitField(field: number, width: number, name: string): void {
  if (field < 0) {
    throw new StoryException(
      `invalid argument #2 to '${name}' (field cannot be negative)`,
    );
  }
  if (width <= 0) {
    throw new StoryException(
      `invalid argument #3 to '${name}' (width must be positive)`,
    );
  }
  if (field + width > 32) {
    throw new StoryException("trying to access non-existent bits");
  }
}

function luaLshift(v: number, n: number): number {
  const c = Math.trunc(n);
  if (c < 0) return luaRshift(v, -c);
  if (c >= 32) return 0;
  return (v << c) >>> 0;
}

function luaRshift(v: number, n: number): number {
  const c = Math.trunc(n);
  if (c < 0) return luaLshift(v, -c);
  if (c >= 32) return 0;
  return (v >>> 0) >>> c;
}

export function parseLuauNumber(s: string): number | null {
  const t = s.trim();
  if (t === "") return null;
  if (t === "nan" || t === "-nan") return NaN;
  if (t === "inf") return Infinity;
  if (t === "-inf") return -Infinity;
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

function toUint64(n: number): bigint {
  if (!Number.isFinite(n)) return 0n;
  return BigInt.asUintN(64, BigInt(Math.trunc(n)));
}

const pointerIdRegistry = new WeakMap<object, number>();
let nextPointerId = 1;
function luauPointerId(o: object): string {
  ambientReads.count += 1;
  let id = pointerIdRegistry.get(o);
  if (id == null) {
    id = nextPointerId++;
    pointerIdRegistry.set(o, id);
  }
  return "0x" + id.toString(16).padStart(8, "0");
}

export function coerceString(v: any): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number") return luauNumberToString(v);
  if (v != null && typeof v === "object" && "value" in v) {
    const raw = (v as any).value;
    if (typeof raw === "string") return raw;
    if (typeof raw === "number") return luauNumberToString(raw);
  }
  return null;
}

function requireStdLibArg(
  story: any,
  v: any,
  index: number,
  name: string,
): void {
  const missing =
    v === undefined ||
    v instanceof Void ||
    (v instanceof MultiValue && v.values.length === 0);
  if (missing) {
    story.Error(`missing argument #${index} to '${name}'`);
  }
}

function requireTableArg(
  story: any,
  v: any,
  index: number,
  name: string,
): ObjectValue {
  const missing =
    v === undefined ||
    v instanceof Void ||
    (v instanceof MultiValue && v.values.length === 0);
  if (missing) {
    story.Error(`missing argument #${index} to '${name}' (table expected)`);
  }
  const raw = v instanceof MultiValue ? v.values[0] : v;
  if (!(raw instanceof ObjectValue)) {
    story.Error(
      `invalid argument #${index} to '${name}' (table expected, got ${luauTypeOf(raw)})`,
    );
  }
  return raw as ObjectValue;
}

export function luauTableBorder(x: Map<string, any>): number {
  const cap: number = (x as any).__luauCapacity ?? 0;
  if (cap > 0 && x.has(String(cap))) {
    let n = cap;
    while (x.has(String(n + 1))) n++;
    return n;
  }
  let b: number = (x as any).__luauBoundary ?? 0;
  while (b > 0 && !x.has(String(b))) b--;
  while (x.has(String(b + 1))) b++;
  (x as any).__luauBoundary = b;
  return b;
}

export function luauTypeOf(v: any): string {
  if (v == null) return "nil";
  if (typeof v === "object" && "value" in v) {
    if (v instanceof SymbolValue || v instanceof VariablePointerValue) {
      return "function";
    }
    const raw = (v as any).value;
    if (raw == null) return "nil";
    if (typeof raw === "number") return "number";
    if (typeof raw === "string") return "string";
    if (typeof raw === "boolean") return "boolean";
    if (raw instanceof Map) {
      if (raw.has("__closure_fn")) return "function";
      if (raw.has("__stdlib_fn")) return "function";
      if (raw.has("__userdata")) return "userdata";
      return "table";
    }
    if (typeof raw === "object") return "table";
  }
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  if (typeof v === "boolean") return "boolean";
  return "userdata";
}

export function isTruthy(v: any): boolean {
  if (v == null) return false;
  if (v === false) return false;
  if (typeof v === "object" && "value" in v) {
    const raw = (v as any).value;
    if (raw == null || raw === false) return false;
  }
  if (v instanceof Void) {
    return false;
  }
  return true;
}

function protectedSuccess(values: readonly AbstractValue[]): MultiValue {
  const flat: AbstractValue[] = [new BoolValue(true)];
  for (const v of values) {
    if (v instanceof MultiValue) flat.push(...v.values);
    else flat.push(v);
  }
  return new MultiValue(flat);
}

export function resolveInit(arg: any, strLen: number): number {
  const n = coerceNumber(arg);
  if (n == null) return 1;
  let i = Math.floor(n);
  if (i < 0) i = Math.max(strLen + i + 1, 1);
  else if (i === 0) i = 1;
  if (i > strLen + 1) i = strLen + 1;
  return i;
}

const PACK_MAXINTSIZE = 16;
const PACK_SZINT = 8;
const PACK_MAXALIGN = 8;
const PACK_MAXSSIZE = 1 << 30;
const PACK_INT_MAX = 2147483647;

type PackItem =
  | {
      kind: "int";
      size: number;
      signed: boolean;
      littleEndian: boolean;
      align: number;
    }
  | { kind: "float"; size: 4 | 8; littleEndian: boolean; align: number }
  | { kind: "char"; size: number }
  | { kind: "string"; lenSize: number; littleEndian: boolean; align: number }
  | { kind: "zstr" }
  | { kind: "padding" }
  | { kind: "alignpad"; align: number };

function packDataSize(item: PackItem): number {
  switch (item.kind) {
    case "int":
    case "float":
    case "char":
      return item.size;
    case "string":
      return item.lenSize;
    case "padding":
      return 1;
    default:
      return 0;
  }
}

function packItemAlign(item: PackItem): number {
  return "align" in item ? item.align : 0;
}

function packPadCount(align: number, pos: number): number {
  if (align <= 1) return 0;
  return (align - (pos & (align - 1))) & (align - 1);
}

function parsePackFormat(fmt: string, story: any): PackItem[] | null {
  const items: PackItem[] = [];
  let i = 0;
  let littleEndian = true;
  let maxAlign = 1;

  const isDigit = () => {
    const c = fmt.charCodeAt(i);
    return c >= 48 && c <= 57;
  };

  const getNum = (df: number): number => {
    if (i >= fmt.length || !isDigit()) return df;
    let a = 0;
    do {
      a = a * 10 + (fmt.charCodeAt(i++) - 48);
    } while (i < fmt.length && isDigit() && a <= (PACK_INT_MAX - 9) / 10);
    if (a > PACK_MAXSSIZE || (i < fmt.length && isDigit())) {
      story.Error("string.pack: size specifier is too large");
    }
    return a;
  };

  const getNumLimit = (df: number): number => {
    const sz = getNum(df);
    if (sz > PACK_MAXINTSIZE || sz <= 0) {
      story.Error(
        `string.pack: integral size (${sz}) out of limits [1,${PACK_MAXINTSIZE}]`,
      );
    }
    return sz;
  };

  type PackOpt =
    | { k: "int"; size: number; signed: boolean }
    | { k: "float"; size: 4 | 8 }
    | { k: "char"; size: number }
    | { k: "string"; lenSize: number }
    | { k: "zstr" }
    | { k: "padding" }
    | { k: "alignpad" }
    | { k: "nop" };

  const optSize = (o: PackOpt): number => {
    switch (o.k) {
      case "int":
      case "float":
      case "char":
        return o.size;
      case "string":
        return o.lenSize;
      case "padding":
        return 1;
      default:
        return 0;
    }
  };

  const getOption = (): PackOpt | null => {
    const c = fmt.charAt(i++);
    switch (c) {
      case "b":
        return { k: "int", size: 1, signed: true };
      case "B":
        return { k: "int", size: 1, signed: false };
      case "h":
        return { k: "int", size: 2, signed: true };
      case "H":
        return { k: "int", size: 2, signed: false };
      case "l":
        return { k: "int", size: 8, signed: true };
      case "L":
        return { k: "int", size: 8, signed: false };
      case "j":
        return { k: "int", size: 4, signed: true };
      case "J":
      case "T":
        return { k: "int", size: 4, signed: false };
      case "f":
        return { k: "float", size: 4 };
      case "d":
      case "n":
        return { k: "float", size: 8 };
      case "i":
        return { k: "int", size: getNumLimit(4), signed: true };
      case "I":
        return { k: "int", size: getNumLimit(4), signed: false };
      case "s":
        return { k: "string", lenSize: getNumLimit(4) };
      case "c": {
        const size = getNum(-1);
        if (size === -1) {
          story.Error("string.pack: missing size for format option 'c'");
          return null;
        }
        return { k: "char", size };
      }
      case "z":
        return { k: "zstr" };
      case "x":
        return { k: "padding" };
      case "X":
        return { k: "alignpad" };
      case " ":
        return { k: "nop" };
      case "<":
        littleEndian = true;
        return { k: "nop" };
      case ">":
        littleEndian = false;
        return { k: "nop" };
      case "=":
        littleEndian = true;
        return { k: "nop" };
      case "!":
        maxAlign = getNumLimit(PACK_MAXALIGN);
        return { k: "nop" };
      default:
        story.Error(`string.pack: invalid format option '${c}'`);
        return null;
    }
  };

  while (i < fmt.length) {
    const opt = getOption();
    if (opt == null) return null;
    let align = optSize(opt);
    if (opt.k === "alignpad") {
      if (i >= fmt.length) {
        story.Error("string.pack: invalid next option for option 'X'");
        return null;
      }
      const next = getOption();
      if (next == null) return null;
      align = optSize(next);
      if (next.k === "char" || align === 0) {
        story.Error("string.pack: invalid next option for option 'X'");
        return null;
      }
    }
    let resolvedAlign = 0;
    if (align > 1 && opt.k !== "char") {
      if (align > maxAlign) align = maxAlign;
      if ((align & (align - 1)) !== 0) {
        story.Error("string.pack: format asks for alignment not power of 2");
        return null;
      }
      resolvedAlign = align;
    }
    switch (opt.k) {
      case "int":
        items.push({
          kind: "int",
          size: opt.size,
          signed: opt.signed,
          littleEndian,
          align: resolvedAlign,
        });
        break;
      case "float":
        items.push({
          kind: "float",
          size: opt.size,
          littleEndian,
          align: resolvedAlign,
        });
        break;
      case "char":
        items.push({ kind: "char", size: opt.size });
        break;
      case "string":
        items.push({
          kind: "string",
          lenSize: opt.lenSize,
          littleEndian,
          align: resolvedAlign,
        });
        break;
      case "zstr":
        items.push({ kind: "zstr" });
        break;
      case "padding":
        items.push({ kind: "padding" });
        break;
      case "alignpad":
        items.push({ kind: "alignpad", align: resolvedAlign });
        break;
      case "nop":
        break;
    }
  }
  return items;
}

function writePackedInt(
  bytes: number[],
  n: bigint,
  size: number,
  littleEndian: boolean,
  negFill: boolean,
) {
  const low = BigInt.asUintN(64, n);
  const buff = new Array<number>(size);
  for (let k = 0; k < size; k++) {
    const b =
      k < PACK_SZINT
        ? Number((low >> BigInt(8 * k)) & 0xffn)
        : negFill
          ? 0xff
          : 0x00;
    buff[littleEndian ? k : size - 1 - k] = b;
  }
  for (const b of buff) bytes.push(b);
}

function readPackedInt(
  data: string,
  offset: number,
  size: number,
  signed: boolean,
  littleEndian: boolean,
  story: any,
): number {
  const byteAt = (k: number) =>
    data.charCodeAt(offset + (littleEndian ? k : size - 1 - k)) & 0xff;
  const limit = Math.min(size, PACK_SZINT);
  let res = 0n;
  for (let k = limit - 1; k >= 0; k--) {
    res = (res << 8n) | BigInt(byteAt(k));
  }
  if (size < PACK_SZINT) {
    if (signed) {
      const mask = 1n << BigInt(8 * size - 1);
      res = (res ^ mask) - mask;
    }
  } else if (size > PACK_SZINT) {
    const fill = !signed || BigInt.asIntN(64, res) >= 0n ? 0 : 0xff;
    for (let k = limit; k < size; k++) {
      if (byteAt(k) !== fill) {
        story.Error(
          `string.unpack: ${size}-byte integer does not fit into Lua Integer`,
        );
      }
    }
  }
  return signed
    ? Number(BigInt.asIntN(64, res))
    : Number(BigInt.asUintN(64, res));
}

function bytesToString(bytes: number[]): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

function packString(fmt: string, args: any[], story: any): string | null {
  const items = parsePackFormat(fmt, story);
  if (items == null) return null;
  const bytes: number[] = [];
  let argIdx = 0;
  const nextNumber = (): number | null => {
    if (argIdx >= args.length) {
      story.Error("string.pack: not enough arguments for format");
      return null;
    }
    const n = coerceNumber(args[argIdx++]);
    if (n == null) {
      story.Error("string.pack: number expected");
      return null;
    }
    return n;
  };
  const nextString = (): string | null => {
    if (argIdx >= args.length) {
      story.Error("string.pack: not enough arguments for format");
      return null;
    }
    const s = coerceString(args[argIdx++]);
    if (s == null) {
      story.Error("string.pack: string expected");
      return null;
    }
    return s;
  };
  for (const item of items) {
    const pad = packPadCount(packItemAlign(item), bytes.length);
    for (let k = 0; k < pad; k++) bytes.push(0);
    if (item.kind === "alignpad") continue;
    if (item.kind === "padding") {
      bytes.push(0);
      continue;
    }
    if (item.kind === "int") {
      const raw = nextNumber();
      if (raw == null) return null;
      if (!Number.isFinite(raw)) {
        story.Error("string.pack: number has no integer representation");
        return null;
      }
      const n = BigInt(Math.trunc(raw));
      if (item.size < PACK_SZINT) {
        if (item.signed) {
          const lim = 1n << BigInt(item.size * 8 - 1);
          if (!(-lim <= n && n < lim)) {
            story.Error("string.pack: integer overflow");
            return null;
          }
        } else if (BigInt.asUintN(64, n) >= 1n << BigInt(item.size * 8)) {
          story.Error("string.pack: unsigned overflow");
          return null;
        }
      }
      writePackedInt(
        bytes,
        n,
        item.size,
        item.littleEndian,
        item.signed && n < 0n,
      );
    } else if (item.kind === "float") {
      const n = nextNumber();
      if (n == null) return null;
      const view = new DataView(new ArrayBuffer(item.size));
      if (item.size === 4) view.setFloat32(0, n, item.littleEndian);
      else view.setFloat64(0, n, item.littleEndian);
      for (let k = 0; k < item.size; k++) bytes.push(view.getUint8(k));
    } else if (item.kind === "char") {
      const s = nextString();
      if (s == null) return null;
      if (s.length > item.size) {
        story.Error("string.pack: string longer than given size");
        return null;
      }
      for (let k = 0; k < s.length; k++) bytes.push(s.charCodeAt(k) & 0xff);
      for (let k = s.length; k < item.size; k++) bytes.push(0);
    } else if (item.kind === "string") {
      const s = nextString();
      if (s == null) return null;
      if (
        item.lenSize < PACK_SZINT &&
        s.length >= 2 ** (8 * item.lenSize)
      ) {
        story.Error("string.pack: string length does not fit in given size");
        return null;
      }
      writePackedInt(
        bytes,
        BigInt(s.length),
        item.lenSize,
        item.littleEndian,
        false,
      );
      for (let k = 0; k < s.length; k++) bytes.push(s.charCodeAt(k) & 0xff);
    } else if (item.kind === "zstr") {
      const s = nextString();
      if (s == null) return null;
      for (let k = 0; k < s.length; k++) {
        const c = s.charCodeAt(k) & 0xff;
        if (c === 0) {
          story.Error("string.pack: string contains zeros");
          return null;
        }
        bytes.push(c);
      }
      bytes.push(0);
    }
  }
  return bytesToString(bytes);
}

function unpackString(
  fmt: string,
  data: string,
  posArg: number,
  story: any,
): { values: AbstractValue[]; nextPos: number } | null {
  const ld = data.length;
  let rel = Math.trunc(posArg);
  if (rel < 0) rel += ld + 1;
  if (rel < 0) rel = 0;
  let pos = rel - 1;
  if (pos < 0) pos = 0;
  if (pos > ld) {
    story.Error("string.unpack: initial position out of string");
    return null;
  }
  const items = parsePackFormat(fmt, story);
  if (items == null) return null;
  const values: AbstractValue[] = [];
  for (const item of items) {
    const pad = packPadCount(packItemAlign(item), pos);
    const size = packDataSize(item);
    if (pad + size > ld - pos) {
      story.Error("string.unpack: data string too short");
      return null;
    }
    pos += pad;
    if (item.kind === "int") {
      values.push(
        new IntValue(
          readPackedInt(
            data,
            pos,
            item.size,
            item.signed,
            item.littleEndian,
            story,
          ),
        ),
      );
    } else if (item.kind === "float") {
      const view = new DataView(new ArrayBuffer(item.size));
      for (let k = 0; k < item.size; k++) {
        view.setUint8(k, data.charCodeAt(pos + k) & 0xff);
      }
      values.push(
        new FloatValue(
          item.size === 4
            ? view.getFloat32(0, item.littleEndian)
            : view.getFloat64(0, item.littleEndian),
        ),
      );
    } else if (item.kind === "char") {
      values.push(new StringValue(data.slice(pos, pos + item.size)));
    } else if (item.kind === "string") {
      const len = readPackedInt(
        data,
        pos,
        item.lenSize,
        false,
        item.littleEndian,
        story,
      );
      if (len > ld - pos - size) {
        story.Error("string.unpack: data string too short");
        return null;
      }
      values.push(new StringValue(data.slice(pos + size, pos + size + len)));
      pos += len;
    } else if (item.kind === "zstr") {
      let end = pos;
      while (end < ld && data.charCodeAt(end) !== 0) end++;
      if (end >= ld) {
        story.Error("string.unpack: unfinished string for format 'z'");
        return null;
      }
      values.push(new StringValue(data.slice(pos, end)));
      pos = end + 1;
    }
    pos += size;
  }
  return { values, nextPos: pos + 1 };
}

function packSize(fmt: string, story: any): number | null {
  const items = parsePackFormat(fmt, story);
  if (items == null) return null;
  let total = 0;
  for (const item of items) {
    if (item.kind === "string" || item.kind === "zstr") {
      story.Error("string.packsize: variable-length format");
      return null;
    }
    const size = packPadCount(packItemAlign(item), total) + packDataSize(item);
    if (total > PACK_MAXSSIZE - size) {
      story.Error("string.packsize: format result too large");
      return null;
    }
    total += size;
  }
  return total;
}

interface DateFields {
  year: number;
  month: number;
  day: number;
  hour: number;
  min: number;
  sec: number;
  wday: number;
  yday: number;
  isdst: boolean;
  weekdayName: string;
  monthName: string;
}

const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function dayOfYear(year: number, month: number, day: number): number {
  const daysPerMonth = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeap =
    (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  let d = day;
  for (let m = 1; m < month; m++) {
    d += daysPerMonth[m - 1]!;
    if (m === 2 && isLeap) d += 1;
  }
  return d;
}

function getDateFieldsLocal(d: Date): DateFields {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const jan = new Date(year, 0, 1).getTimezoneOffset();
  const isdst = d.getTimezoneOffset() < jan;
  return {
    year,
    month,
    day,
    hour: d.getHours(),
    min: d.getMinutes(),
    sec: d.getSeconds(),
    wday: d.getDay() + 1,
    yday: dayOfYear(year, month, day),
    isdst,
    weekdayName: WEEKDAY_NAMES[d.getDay()]!,
    monthName: MONTH_NAMES[d.getMonth()]!,
  };
}

function getDateFieldsUTC(d: Date): DateFields {
  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return {
    year,
    month,
    day,
    hour: d.getUTCHours(),
    min: d.getUTCMinutes(),
    sec: d.getUTCSeconds(),
    wday: d.getUTCDay() + 1,
    yday: dayOfYear(year, month, day),
    isdst: false,
    weekdayName: WEEKDAY_NAMES[d.getUTCDay()]!,
    monthName: MONTH_NAMES[d.getUTCMonth()]!,
  };
}

function pad2(n: number): string {
  return n < 10 ? "0" + n : String(n);
}

function pad3(n: number): string {
  if (n < 10) return "00" + n;
  if (n < 100) return "0" + n;
  return String(n);
}

function formatDateString(
  fmt: string,
  f: DateFields,
  story: any,
): string {
  let out = "";
  let i = 0;
  while (i < fmt.length) {
    const c = fmt.charAt(i);
    if (c !== "%") {
      out += c;
      i++;
      continue;
    }
    const next = fmt.charAt(i + 1);
    switch (next) {
      case "a":
        out += f.weekdayName.slice(0, 3);
        break;
      case "A":
        out += f.weekdayName;
        break;
      case "b":
      case "h":
        out += f.monthName.slice(0, 3);
        break;
      case "B":
        out += f.monthName;
        break;
      case "c":
        out += `${f.weekdayName.slice(0, 3)} ${f.monthName.slice(0, 3)} ${pad2(f.day)} ${pad2(f.hour)}:${pad2(f.min)}:${pad2(f.sec)} ${f.year}`;
        break;
      case "d":
        out += pad2(f.day);
        break;
      case "H":
        out += pad2(f.hour);
        break;
      case "I": {
        const h12 = f.hour % 12 === 0 ? 12 : f.hour % 12;
        out += pad2(h12);
        break;
      }
      case "j":
        out += pad3(f.yday);
        break;
      case "M":
        out += pad2(f.min);
        break;
      case "m":
        out += pad2(f.month);
        break;
      case "p":
        out += f.hour < 12 ? "AM" : "PM";
        break;
      case "S":
        out += pad2(f.sec);
        break;
      case "w":
        out += String(f.wday - 1);
        break;
      case "x":
        out += `${pad2(f.month)}/${pad2(f.day)}/${String(f.year).slice(-2)}`;
        break;
      case "X":
        out += `${pad2(f.hour)}:${pad2(f.min)}:${pad2(f.sec)}`;
        break;
      case "y":
        out += String(f.year % 100).padStart(2, "0");
        break;
      case "Y":
        out += String(f.year);
        break;
      case "Z":
        out += "UTC";
        break;
      case "%":
        out += "%";
        break;
      case "":
        story.Error("os.date: invalid conversion specifier '%'");
        return "";
      default:
        story.Error(`os.date: invalid conversion specifier '%${next}'`);
        return "";
    }
    i += 2;
  }
  return out;
}

const PERLIN_PERMUTATION = [
  151, 160, 137, 91, 90, 15, 131, 13, 201, 95, 96, 53, 194, 233, 7, 225,
  140, 36, 103, 30, 69, 142, 8, 99, 37, 240, 21, 10, 23, 190, 6, 148, 247,
  120, 234, 75, 0, 26, 197, 62, 94, 252, 219, 203, 117, 35, 11, 32, 57, 177,
  33, 88, 237, 149, 56, 87, 174, 20, 125, 136, 171, 168, 68, 175, 74, 165,
  71, 134, 139, 48, 27, 166, 77, 146, 158, 231, 83, 111, 229, 122, 60, 211,
  133, 230, 220, 105, 92, 41, 55, 46, 245, 40, 244, 102, 143, 54, 65, 25,
  63, 161, 1, 216, 80, 73, 209, 76, 132, 187, 208, 89, 18, 169, 200, 196,
  135, 130, 116, 188, 159, 86, 164, 100, 109, 198, 173, 186, 3, 64, 52, 217,
  226, 250, 124, 123, 5, 202, 38, 147, 118, 126, 255, 82, 85, 212, 207, 206,
  59, 227, 47, 16, 58, 17, 182, 189, 28, 42, 223, 183, 170, 213, 119, 248,
  152, 2, 44, 154, 163, 70, 221, 153, 101, 155, 167, 43, 172, 9, 129, 22,
  39, 253, 19, 98, 108, 110, 79, 113, 224, 232, 178, 185, 112, 104, 218, 246,
  97, 228, 251, 34, 242, 193, 238, 210, 144, 12, 191, 179, 162, 241, 81, 51,
  145, 235, 249, 14, 239, 107, 49, 192, 214, 31, 181, 199, 106, 157, 184, 84,
  204, 176, 115, 121, 50, 45, 127, 4, 150, 254, 138, 236, 205, 93, 222, 114,
  67, 29, 24, 72, 243, 141, 128, 195, 78, 66, 215, 61, 156, 180,
];
const PERLIN_P = new Uint8Array(512);
for (let i = 0; i < 256; i++) {
  PERLIN_P[i] = PERLIN_PERMUTATION[i]!;
  PERLIN_P[i + 256] = PERLIN_PERMUTATION[i]!;
}

const fr = Math.fround;

function perlinFade(t: number): number {
  const t6m15 = fr(fr(t * 6) - 15);
  const inner = fr(fr(t * t6m15) + 10);
  const ttt = fr(fr(t * t) * t);
  return fr(ttt * inner);
}

function perlinLerp(t: number, a: number, b: number): number {
  return fr(a + fr(t * fr(b - a)));
}

function perlinGrad(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return fr(((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v));
}

function perlinNoise(xIn: number, yIn: number, zIn: number): number {
  let x = fr(xIn);
  let y = fr(yIn);
  let z = fr(zIn);
  const fx = Math.floor(x);
  const fy = Math.floor(y);
  const fz = Math.floor(z);
  const X = fx & 255;
  const Y = fy & 255;
  const Z = fz & 255;
  x = fr(x - fx);
  y = fr(y - fy);
  z = fr(z - fz);
  const u = perlinFade(x);
  const v = perlinFade(y);
  const w = perlinFade(z);
  const A = PERLIN_P[X]! + Y;
  const AA = PERLIN_P[A]! + Z;
  const AB = PERLIN_P[A + 1]! + Z;
  const B = PERLIN_P[X + 1]! + Y;
  const BA = PERLIN_P[B]! + Z;
  const BB = PERLIN_P[B + 1]! + Z;
  return perlinLerp(
    w,
    perlinLerp(
      v,
      perlinLerp(
        u,
        perlinGrad(PERLIN_P[AA]!, x, y, z),
        perlinGrad(PERLIN_P[BA]!, fr(x - 1), y, z),
      ),
      perlinLerp(
        u,
        perlinGrad(PERLIN_P[AB]!, x, fr(y - 1), z),
        perlinGrad(PERLIN_P[BB]!, fr(x - 1), fr(y - 1), z),
      ),
    ),
    perlinLerp(
      v,
      perlinLerp(
        u,
        perlinGrad(PERLIN_P[AA + 1]!, x, y, fr(z - 1)),
        perlinGrad(PERLIN_P[BA + 1]!, fr(x - 1), y, fr(z - 1)),
      ),
      perlinLerp(
        u,
        perlinGrad(PERLIN_P[AB + 1]!, x, fr(y - 1), fr(z - 1)),
        perlinGrad(PERLIN_P[BB + 1]!, fr(x - 1), fr(y - 1), fr(z - 1)),
      ),
    ),
  );
}

function classifyGsubRepl(
  repl: any,
  story: any,
): "string" | "table" | "function" | "error" {
  if (repl == null) {
    story.Error("string.gsub: replacement argument is required");
    return "error";
  }
  if (coerceString(repl) != null || coerceNumber(repl) != null) {
    return "string";
  }
  if (repl instanceof ObjectValue) {
    const map = repl.value;
    if (
      map instanceof Map &&
      (map.has("__closure_fn") || map.has("__stdlib_fn"))
    ) {
      return "function";
    }
    return "table";
  }
  if (repl instanceof SymbolValue || repl instanceof VariablePointerValue) {
    return "function";
  }
  story.Error(
    "string.gsub: replacement must be a string, number, table, or function",
  );
  return "error";
}

function gsubTableLookup(
  story: any,
  tbl: ObjectValue,
  key: string,
): AbstractValue | null {
  let base: any = tbl;
  for (let depth = 0; depth < 32; depth++) {
    const direct = (base.value as Map<string, AbstractValue>)?.get(key);
    if (direct != null) return direct;
    const mt = base?.metatable;
    if (!(mt instanceof ObjectValue)) return null;
    const idx = (mt.value as Map<string, AbstractValue>)?.get("__index");
    if (idx == null || idx instanceof NullValue) return null;
    if (
      idx instanceof ObjectValue &&
      !(idx.value as Map<string, AbstractValue>)?.has("__closure_fn")
    ) {
      base = idx;
      continue;
    }
    const results = story.CallLuauFunction(idx, [base, new StringValue(key)]);
    return oneValue((results?.[0] as AbstractValue) ?? null);
  }
  return null;
}

function expandGsubStringRepl(
  template: string,
  matched: PatternMatchResult,
  wholeMatch: string,
  story: any,
): string | null {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const c = template.charAt(i);
    if (c !== "%") {
      out += c;
      i++;
      continue;
    }
    const next = template.charAt(i + 1);
    if (next === "%") {
      out += "%";
      i += 2;
      continue;
    }
    if (next >= "0" && next <= "9") {
      const n = parseInt(next, 10);
      if (n === 0) {
        out += wholeMatch;
      } else if (n === 1 && matched.captures.length === 0) {
        out += wholeMatch;
      } else if (n <= matched.captures.length) {
        const cap = matched.captures[n - 1];
        out += cap == null ? "" : String(cap);
      } else {
        story.Error(
          `string.gsub: invalid capture index %${n} (pattern has ${matched.captures.length} capture${matched.captures.length === 1 ? "" : "s"})`,
        );
        return null;
      }
      i += 2;
      continue;
    }
    story.Error(
      `string.gsub: invalid escape "%${next || "<eof>"}" in replacement string`,
    );
    return null;
  }
  return out;
}

export function patternCapturesToValues(
  result: PatternMatchResult,
): AbstractValue[] {
  return result.captures.map((c) => {
    if (c == null) return new NullValue();
    if (typeof c === "number") return new IntValue(c);
    return new StringValue(c);
  });
}

function formatLuaString(story: any, fmt: string, args: any[]): string {
  let out = "";
  let i = 0;
  let argIdx = 0;
  const isDigit = (ch: string) => ch >= "0" && ch <= "9";
  while (i < fmt.length) {
    const ch = fmt.charAt(i);
    if (ch !== "%") {
      out += ch;
      i++;
      continue;
    }
    i++;
    if (fmt.charAt(i) === "%") {
      out += "%";
      i++;
      continue;
    }
    if (fmt.charAt(i) === "*") {
      i++;
      if (argIdx >= args.length) {
        story.Error(`string.format: missing argument #${argIdx + 2}`);
        return out;
      }
      out += luauAnyToDisplayString(story, args[argIdx++]);
      continue;
    }
    if (argIdx >= args.length) {
      story.Error(`string.format: missing argument #${argIdx + 2}`);
      return out;
    }
    const flagsStart = i;
    while (i < fmt.length && "-+ #0".indexOf(fmt.charAt(i)) >= 0) i++;
    if (i - flagsStart > 5) {
      story.Error("string.format: invalid format (repeated flags)");
      return out;
    }
    const flags = new Set(fmt.slice(flagsStart, i).split(""));
    let widthStr = "";
    while (widthStr.length < 2 && i < fmt.length && isDigit(fmt.charAt(i))) {
      widthStr += fmt.charAt(i++);
    }
    let precisionStr: string | null = null;
    if (fmt.charAt(i) === ".") {
      i++;
      precisionStr = "";
      while (
        precisionStr.length < 2 &&
        i < fmt.length &&
        isDigit(fmt.charAt(i))
      ) {
        precisionStr += fmt.charAt(i++);
      }
    }
    if (i < fmt.length && isDigit(fmt.charAt(i))) {
      story.Error(
        "string.format: invalid format (width or precision too long)",
      );
      return out;
    }
    const type = fmt.charAt(i);
    i++;
    if (type === "*") {
      story.Error("string.format: '%*' does not take a form");
      return out;
    }
    if (type === "" || !"diouxXeEfgGcsq".includes(type)) {
      story.Error(`string.format: invalid option '%${type}' to 'format'`);
      return out;
    }
    const arg =
      type === "s"
        ? luauAnyToDisplayString(story, args[argIdx++])
        : args[argIdx++];
    const width = widthStr ? parseInt(widthStr, 10) : 0;
    const precision =
      precisionStr == null
        ? null
        : precisionStr === ""
          ? 0
          : parseInt(precisionStr, 10);
    let formatted: string;
    try {
      formatted = formatOneSpec(arg, type, flags, precision);
    } catch (e) {
      story.Error(
        `string.format: ${(e as Error).message ?? String(e)} (for "%${type}")`,
      );
      formatted = "";
    }
    if (width > formatted.length) {
      if (flags.has("-")) {
        formatted = formatted.padEnd(width, " ");
      } else if (flags.has("0") && /[diouxXeEfgG]/.test(type)) {
        const signMatch = /^[-+ ]/.exec(formatted);
        if (signMatch) {
          formatted =
            signMatch[0] +
            formatted
              .slice(signMatch[0].length)
              .padStart(width - signMatch[0].length, "0");
        } else {
          formatted = formatted.padStart(width, "0");
        }
      } else {
        formatted = formatted.padStart(width, " ");
      }
    }
    out += formatted;
  }
  return out;
}

function luauAnyToDisplayString(story: any, v: any): string {
  const r = STDLIB["tostring"]!.fn(story, [v]);
  if (typeof r === "string") return r;
  return coerceString(r) ?? String(r);
}

function formatOneSpec(
  arg: any,
  type: string,
  flags: Set<string>,
  precision: number | null,
): string {
  const signPrefix = (n: number): string => {
    if (n < 0) return "";
    if (flags.has("+")) return "+";
    if (flags.has(" ")) return " ";
    return "";
  };
  const numericArg = (): number => {
    const n = coerceNumber(arg);
    if (n === null) {
      throw new Error("expected a number");
    }
    return n;
  };
  switch (type) {
    case "d":
    case "i": {
      const n = Math.trunc(numericArg());
      const abs = Math.abs(n);
      let body = String(abs);
      if (precision !== null) body = body.padStart(precision, "0");
      return (n < 0 ? "-" : signPrefix(n)) + body;
    }
    case "u": {
      const u = toUint64(numericArg()).toString();
      return precision !== null ? u.padStart(precision, "0") : u;
    }
    case "o": {
      let body = toUint64(numericArg()).toString(8);
      if (precision !== null) body = body.padStart(precision, "0");
      if (flags.has("#") && !body.startsWith("0")) body = "0" + body;
      return body;
    }
    case "x":
    case "X": {
      let body = toUint64(numericArg()).toString(16);
      if (type === "X") body = body.toUpperCase();
      if (precision !== null) body = body.padStart(precision, "0");
      if (flags.has("#")) body = (type === "X" ? "0X" : "0x") + body;
      return body;
    }
    case "e":
    case "E": {
      const n = numericArg();
      const p = precision ?? 6;
      let body = Math.abs(n).toExponential(p);
      body = body.replace(/e([+-])(\d)$/, "e$10$2");
      if (type === "E") body = body.toUpperCase();
      return (n < 0 ? "-" : signPrefix(n)) + body;
    }
    case "f": {
      const n = numericArg();
      const p = precision ?? 6;
      const abs = Math.abs(n);
      let body: string;
      if (!Number.isFinite(abs)) {
        body = Number.isNaN(abs) ? "nan" : "inf";
      } else if (abs >= 1e21) {
        body = BigInt(abs).toString() + (p > 0 ? "." + "0".repeat(p) : "");
      } else {
        body = abs.toFixed(p);
      }
      return (n < 0 ? "-" : signPrefix(n)) + body;
    }
    case "g":
    case "G": {
      const n = numericArg();
      const p = Math.max(1, precision ?? 6);
      const abs = Math.abs(n);
      let body: string;
      if (!isFinite(abs)) {
        body = Number.isNaN(abs) ? "nan" : "inf";
      } else if (abs === 0) {
        body = "0";
      } else {
        const exp = parseInt(abs.toExponential(p - 1).split("e")[1]!, 10);
        if (exp < -4 || exp >= p) {
          body = abs
            .toExponential(p - 1)
            .replace(/\.?0+e/, "e")
            .replace(/e([+-])(\d)$/, "e$10$2");
        } else {
          body = abs.toFixed(Math.max(0, p - 1 - exp));
          if (body.indexOf(".") >= 0) {
            body = body.replace(/\.?0+$/, "");
          }
        }
      }
      if (type === "G") body = body.toUpperCase();
      return (n < 0 ? "-" : signPrefix(n)) + body;
    }
    case "c": {
      const n = numericArg();
      return String.fromCodePoint(Math.trunc(n));
    }
    case "s": {
      const s = coerceString(arg) ?? (arg == null ? "nil" : String(arg));
      return precision !== null ? s.slice(0, precision) : s;
    }
    case "q": {
      const s = coerceString(arg) ?? "";
      return (
        '"' +
        s.replace(/[\\"\n\r\0]/g, (c) => {
          if (c === "\n") return "\\\n";
          if (c === "\r") return "\\r";
          if (c === "\0") return "\\000";
          return "\\" + c;
        }) +
        '"'
      );
    }
    default:
      throw new Error(`unsupported conversion "%${type}"`);
  }
}

function unpackImpl(story: any, args: any[], fnName: string): any[] {
  if (!(args[0] instanceof ObjectValue)) {
    story.Error(`${fnName}: first argument must be a table`);
    return [];
  }
  const map = args[0].value as Map<string, AbstractValue> | null;
  if (!map) return [];
  let len = 0;
  while (map.has(String(len + 1))) len++;
  const i = args.length > 1 ? (coerceNumber(args[1]) ?? 1) : 1;
  const j = args.length > 2 ? (coerceNumber(args[2]) ?? len) : len;
  if (j - i + 1 > 7999) {
    throw new StoryException("too many results to unpack");
  }
  const out: any[] = [];
  for (let k = i; k <= j; k++) {
    out.push(map.get(String(k)) ?? null);
  }
  return out;
}

export function luauStringToBytes(s: string): number[] {
  const out: number[] = [];
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp <= 0xff) out.push(cp);
    else if (cp <= 0x7ff) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp <= 0xffff)
      out.push(
        0xe0 | (cp >> 12),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return out;
}

const UTF8_DECODE_LIMITS = [0xff, 0x7f, 0x7ff, 0xffff];
function utf8DecodeBytes(
  bytes: number[],
  i: number,
): { code: number; next: number } | null {
  const c = bytes[i];
  if (c === undefined) return null;
  if (c < 0x80) return { code: c, next: i + 1 };
  let count = 0;
  let res = 0;
  let cshift = c;
  while (cshift & 0x40) {
    count++;
    const cc = bytes[i + count];
    if (cc === undefined || (cc & 0xc0) !== 0x80) return null;
    res = (res << 6) | (cc & 0x3f);
    cshift = (cshift << 1) & 0xff_ff;
  }
  res |= (cshift & 0x7f) << (count * 5);
  if (count > 3 || res > 0x10ffff || res <= UTF8_DECODE_LIMITS[count]!) {
    return null;
  }
  if (res >= 0xd800 && res < 0xe000) return null;
  return { code: res, next: i + count + 1 };
}

const utf8IsCont = (bytes: number[], i: number) =>
  ((bytes[i] ?? 0) & 0xc0) === 0x80;

function utf8PosRelat(pos: number, len: number): number {
  if (pos >= 0) return pos;
  if (-pos > len) return 0;
  return len + pos + 1;
}


import { checkNumberArg } from "./MethodDispatch";
export {
  callBuiltinMethod,
  isBuiltinMethod,
  METHOD_DISPATCH,
  METHOD_PREFIX,
} from "./MethodDispatch";

export type InkBuiltinAlias = string | ((argCount: number) => string | null);

export const BUILTIN_ITER_TAG = "__builtin_iter";

export const GLOBALS_PROXY_TAG = "__globals_proxy";
const BUILTIN_ITER_STATE = "__builtin_iter_state";
const BUILTIN_ITER_CURSOR = "__builtin_iter_cursor";

type IterStep = (
  state: AbstractValue,
  cursor: AbstractValue | null,
  scratch?: Map<string, AbstractValue> | null,
) => { values: AbstractValue[]; nextCursor: AbstractValue } | null;

const ITER_KEY_SNAPSHOT = "__iter_key_snapshot";

const BUILTIN_ITERATORS: Record<string, IterStep> = {
  pairs: (state, cursor, scratch) => {
    if (!(state instanceof ObjectValue)) return null;
    const map = state.value as Map<string, AbstractValue> | null;
    if (!map) return null;
    const atStart =
      cursor == null ||
      cursor instanceof NullValue ||
      (cursor as any).value === null;
    let keys: string[];
    if (scratch) {
      if (atStart || !scratch.has(ITER_KEY_SNAPSHOT)) {
        keys = Array.from(map.keys());
        scratch.set(ITER_KEY_SNAPSHOT, keys as any);
      } else {
        keys = scratch.get(ITER_KEY_SNAPSHOT) as any as string[];
      }
    } else {
      keys = Array.from(map.keys());
    }
    let idx: number;
    if (atStart) {
      idx = 0;
    } else {
      const cstr =
        typeof (cursor as any).value === "string"
          ? (cursor as any).value
          : String((cursor as any).value);
      const i = keys.indexOf(cstr);
      idx = i < 0 ? keys.length : i + 1;
    }
    while (idx < keys.length && !map.has(keys[idx]!)) idx++;
    if (idx >= keys.length) return null;
    const key = keys[idx]!;
    const value = map.get(key)! as AbstractValue;
    const keyValue: AbstractValue = /^-?\d+$/.test(key)
      ? new IntValue(parseInt(key, 10))
      : new StringValue(key);
    return {
      values: [keyValue, value],
      nextCursor: new StringValue(key),
    };
  },
  ipairs: (state, cursor) => {
    if (!(state instanceof ObjectValue)) return null;
    const map = state.value as Map<string, AbstractValue> | null;
    if (!map) return null;
    const prev =
      cursor == null ||
      cursor instanceof NullValue ||
      (cursor as any).value === null
        ? 0
        : Number((cursor as any).value);
    const i = prev + 1;
    if (!map.has(String(i))) return null;
    const v = map.get(String(i))! as AbstractValue;
    if (v instanceof NullValue) return null;
    return { values: [new IntValue(i), v], nextCursor: new IntValue(i) };
  },
  instances: (state, cursor, scratch) => {
    if (!(state instanceof ObjectValue)) return null;
    const map = state.value as Map<string, AbstractValue> | null;
    if (!map) return null;
    const atStart =
      cursor == null ||
      cursor instanceof NullValue ||
      (cursor as any).value === null;
    let keys: string[];
    const memberKeys = () =>
      Array.from(map.keys()).filter((k) => isDefineTable(map.get(k)));
    if (scratch) {
      if (atStart || !scratch.has(ITER_KEY_SNAPSHOT)) {
        keys = memberKeys();
        scratch.set(ITER_KEY_SNAPSHOT, keys as any);
      } else {
        keys = scratch.get(ITER_KEY_SNAPSHOT) as any as string[];
      }
    } else {
      keys = memberKeys();
    }
    let idx: number;
    if (atStart) {
      idx = 0;
    } else {
      const cstr = String((cursor as any).value);
      const i = keys.indexOf(cstr);
      idx = i < 0 ? keys.length : i + 1;
    }
    while (idx < keys.length && !isDefineTable(map.get(keys[idx]!))) idx++;
    if (idx >= keys.length) return null;
    const key = keys[idx]!;
    return {
      values: [new StringValue(key), map.get(key)! as AbstractValue],
      nextCursor: new StringValue(key),
    };
  },
  iinstances: (state, cursor, scratch) => {
    if (!(state instanceof ObjectValue)) return null;
    const map = state.value as Map<string, AbstractValue> | null;
    if (!map) return null;
    const atStart =
      cursor == null ||
      cursor instanceof NullValue ||
      (cursor as any).value === null;
    let keys: string[];
    const memberKeys = () =>
      Array.from(map.keys()).filter((k) => isDefineTable(map.get(k)));
    if (scratch) {
      if (atStart || !scratch.has(ITER_KEY_SNAPSHOT)) {
        keys = memberKeys();
        scratch.set(ITER_KEY_SNAPSHOT, keys as any);
      } else {
        keys = scratch.get(ITER_KEY_SNAPSHOT) as any as string[];
      }
    } else {
      keys = memberKeys();
    }
    const prev = atStart ? 0 : Number((cursor as any).value);
    let idx = prev;
    while (idx < keys.length && !isDefineTable(map.get(keys[idx]!))) idx++;
    if (idx >= keys.length) return null;
    return {
      values: [new IntValue(idx + 1), map.get(keys[idx]!)! as AbstractValue],
      nextCursor: new IntValue(idx + 1),
    };
  },
  utf8codes: (state, cursor) => {
    let input: string | null = null;
    if (state instanceof StringValue) {
      input = state.value;
    } else if (state instanceof ObjectValue) {
      const stateMap = state.value as Map<string, AbstractValue> | null;
      const inputVal = stateMap?.get(UTF8CODES_INPUT);
      input = inputVal instanceof Value ? (inputVal.value as string) : null;
    }
    if (input == null) return null;
    const bytes = luauStringToBytes(input);
    const len = bytes.length;
    const prev =
      cursor == null ||
      cursor instanceof NullValue ||
      (cursor as any).value == null
        ? 0
        : Math.trunc(Number((cursor as any).value));
    let n = prev - 1;
    if (n < 0) {
      n = 0;
    } else if (n < len) {
      n++;
      while (utf8IsCont(bytes, n)) n++;
    }
    if (n >= len) return null;
    const d = utf8DecodeBytes(bytes, n);
    if (d === null || utf8IsCont(bytes, d.next)) {
      throw new StoryException("invalid UTF-8 code");
    }
    return {
      values: [new IntValue(n + 1), new IntValue(d.code)],
      nextCursor: new IntValue(n + 1),
    };
  },
  gmatch: (state, cursor) => {
    if (!(state instanceof ObjectValue)) return null;
    const stateMap = state.value as Map<string, AbstractValue> | null;
    if (!stateMap) return null;
    const inputVal = stateMap.get(GMATCH_INPUT);
    const patternVal = stateMap.get(GMATCH_PATTERN);
    const input =
      inputVal instanceof Value ? (inputVal.value as string) : null;
    const pattern =
      patternVal instanceof Value ? (patternVal.value as string) : null;
    if (input == null || pattern == null) return null;
    let offset =
      cursor == null ||
      cursor instanceof NullValue ||
      (cursor as any).value == null
        ? 0
        : Number((cursor as any).value);
    let compiled;
    try {
      compiled = luaPatternToJs(pattern);
    } catch {
      return null;
    }
    if (offset > input.length) return null;
    const matched = executeLuaPattern(compiled, input, offset);
    if (!matched) return null;
    const matchEnd = matched.index + matched.length;
    const values: AbstractValue[] =
      compiled.captureCount === 0
        ? [new StringValue(input.slice(matched.index, matchEnd))]
        : patternCapturesToValues(matched);
    const nextOffset = matched.length === 0 ? matchEnd + 1 : matchEnd;
    return { values, nextCursor: new IntValue(nextOffset) };
  },
};

const GMATCH_INPUT = "__gmatch_input";
const GMATCH_PATTERN = "__gmatch_pattern";
const UTF8CODES_INPUT = "__utf8codes_input";

function makeBuiltinIterator(name: string, table: ObjectValue): ObjectValue {
  const map = new Map<string, AbstractValue>();
  map.set(BUILTIN_ITER_TAG, new StringValue(name));
  map.set(BUILTIN_ITER_STATE, table);
  map.set(BUILTIN_ITER_CURSOR, new NullValue());
  return new ObjectValue(map);
}

export function stepBuiltinIterator(
  iter: ObjectValue,
  stateArg?: AbstractValue | null,
  ctrlArg?: AbstractValue | null,
): AbstractValue {
  const map = iter.value as Map<string, AbstractValue> | null;
  if (!map) return new NullValue();
  const tagVal = map.get(BUILTIN_ITER_TAG);
  const name = (tagVal as Value<string> | undefined)?.value;
  if (!name) return new NullValue();
  const step = BUILTIN_ITERATORS[name];
  if (!step) return new NullValue();

  const explicitState =
    stateArg != null && !(stateArg instanceof NullValue) ? stateArg : null;
  if (explicitState !== null) {
    const result = step(explicitState, ctrlArg ?? null, map);
    if (!result) return new NullValue();
    if (result.values.length === 0) return new NullValue();
    if (result.values.length === 1) return result.values[0]!;
    return new MultiValue(result.values);
  }

  const state = map.get(BUILTIN_ITER_STATE) as AbstractValue | undefined;
  if (state == null) return new NullValue();
  const cursor = (map.get(BUILTIN_ITER_CURSOR) ?? null) as AbstractValue | null;
  const result = step(state, cursor, map);
  if (!result) {
    return new NullValue();
  }
  map.set(BUILTIN_ITER_CURSOR, result.nextCursor);
  if (result.values.length === 0) return new NullValue();
  if (result.values.length === 1) return result.values[0]!;
  return new MultiValue(result.values);
}

const DEFINE_MARKER = "__define";
const DEFINE_PARENT_MARKER = "__defineParent";

function metatableMap(v: AbstractValue | null): Map<
  string,
  AbstractValue
> | null {
  if (v instanceof ObjectValue && v.metatable instanceof ObjectValue) {
    return v.metatable.value as Map<string, AbstractValue>;
  }
  return null;
}

function isDefineTable(v: AbstractValue | null | undefined): v is ObjectValue {
  return metatableMap(v as AbstractValue)?.get(DEFINE_MARKER) != null;
}

function resolveParentType(
  story: any,
  parentName: string,
  flat: ObjectValue,
): ObjectValue {
  const flatMeta = metatableMap(flat);
  const flatParent = flatMeta?.get(DEFINE_PARENT_MARKER);
  if (flatParent == null || coerceString(flatParent) === "") {
    return flat;
  }
  const displaced = story.state.variablesState.GetVariableWithName(
    `$${parentName}_${parentName}`,
  ) as AbstractValue | null;
  if (!(displaced instanceof ObjectValue)) {
    return flat;
  }
  const rootMeta = metatableMap(displaced);
  if (
    coerceString(rootMeta?.get(DEFINE_MARKER) ?? null) !== parentName ||
    rootMeta?.get(DEFINE_PARENT_MARKER) != null
  ) {
    return flat;
  }
  if (rootMeta && !rootMeta.has("__index")) {
    writtenIn(story)(displaced.metatable);
    rootMeta.set("__index", flat);
  }
  return displaced;
}

type Written = (table: ObjectValue | null | undefined) => void;
const writtenIn =
  (story: any): Written =>
  (table) => {
    if (table) story.state.variablesState.WriteBarrier(table);
  };

function defineChain(start: ObjectValue): ObjectValue[] {
  const chain: ObjectValue[] = [];
  let cur: ObjectValue | null = start;
  let guard = 0;
  while (cur instanceof ObjectValue && guard++ < 64) {
    chain.push(cur);
    const idx: AbstractValue | null =
      metatableMap(cur)?.get("__index") ?? null;
    cur = idx instanceof ObjectValue ? idx : null;
  }
  return chain;
}

function copyStoreDefaults(
  chain: ObjectValue[],
  target: ObjectValue,
  written: Written = () => {},
): void {
  const storeKeys = new Set<string>();
  for (const level of chain) {
    const storeList = (level.value as Map<string, AbstractValue>)?.get(
      "__storeProps",
    );
    if (!(storeList instanceof ObjectValue)) continue;
    for (const nameVal of (
      storeList.value as Map<string, AbstractValue>
    ).values()) {
      const propName = coerceString(nameVal);
      if (propName) storeKeys.add(propName);
    }
  }
  for (const propName of storeKeys) {
    if (target.value!.has(propName)) continue;
    for (const level of chain) {
      const def = (level.value as Map<string, AbstractValue>)?.get(propName);
      if (def != null) {
        written(target);
        target.value!.set(propName, def);
        break;
      }
    }
  }
}

const pendingStructuralParents = new WeakMap<
  ObjectValue,
  Map<string, ObjectValue[]>
>();

const structuralChildren = new WeakMap<ObjectValue, ObjectValue[]>();

const structuralStoreCopies = new WeakMap<ObjectValue, string[]>();

function chainReaches(start: ObjectValue, target: ObjectValue): boolean {
  const seen = new Set<ObjectValue>();
  let cur: ObjectValue | null = start;
  while (cur instanceof ObjectValue && !seen.has(cur)) {
    if (cur === target) return true;
    seen.add(cur);
    const idx: AbstractValue | null =
      metatableMap(cur)?.get("__index") ?? null;
    cur = idx instanceof ObjectValue ? idx : null;
  }
  return false;
}

function linkStructuralParent(
  child: ObjectValue,
  parent: ObjectValue,
  written: Written = () => {},
): boolean {
  if (chainReaches(parent, child)) return false;
  written(child.metatable);
  metatableMap(child)?.set("__index", parent);
  const children = structuralChildren.get(parent) ?? [];
  children.push(child);
  structuralChildren.set(parent, children);
  return true;
}

function copyStructuralStoreDefaults(
  block: ObjectValue,
  written: Written = () => {},
): void {
  const map = block.value!;
  const copies = structuralStoreCopies.get(block) ?? [];
  if (copies.length > 0) written(block);
  for (const key of copies) map.delete(key);
  const own = new Set(map.keys());
  copyStoreDefaults(defineChain(block).slice(1), block, written);
  structuralStoreCopies.set(
    block,
    [...map.keys()].filter((key) => !own.has(key)),
  );
  for (const child of structuralChildren.get(block) ?? []) {
    copyStructuralStoreDefaults(child, written);
  }
}

function linkWaitingStructuralChildren(
  typeTable: ObjectValue,
  name: string,
  parent: ObjectValue,
  written: Written = () => {},
): void {
  const waiting = pendingStructuralParents.get(typeTable);
  const children = waiting?.get(name);
  if (!children) return;
  waiting!.delete(name);
  for (const child of children) {
    if (linkStructuralParent(child, parent, written)) {
      copyStructuralStoreDefaults(child, written);
    }
  }
}

function isRootTypeTable(v: AbstractValue | null, name: string): boolean {
  const meta = metatableMap(v);
  return (
    meta != null &&
    coerceString(meta.get(DEFINE_MARKER) ?? null) === name &&
    meta.get(DEFINE_PARENT_MARKER) == null
  );
}

function rootTableFor(
  story: any,
  name: string,
  table: ObjectValue,
): ObjectValue | null {
  for (const key of [name, `$${name}_${name}`]) {
    const held = story.state.variablesState.GetVariableWithName(
      key,
    ) as AbstractValue | null;
    if (
      held instanceof ObjectValue &&
      held !== table &&
      isRootTypeTable(held, name)
    ) {
      return held;
    }
  }
  return null;
}

function isPlainTable(v: AbstractValue | null | undefined): v is ObjectValue {
  return v instanceof ObjectValue && luauTypeOf(v) === "table";
}

function isRecordTable(v: AbstractValue | null | undefined): v is ObjectValue {
  if (!isPlainTable(v)) return false;
  const map = v.value;
  if (!map || isDefineTable(v)) return false;
  if (map.size === 0) return true;
  for (let i = 1; i <= map.size; i++) {
    if (!map.has(String(i))) return true;
  }
  return false;
}

function mergeEntries(
  into: ObjectValue,
  from: ObjectValue,
  written: Written,
  active: Set<ObjectValue>,
): void {
  written(into);
  const map = into.value!;
  for (const [key, value] of from.value!) {
    const held = map.get(key) ?? null;
    if (
      held instanceof ObjectValue &&
      held !== value &&
      !active.has(held) &&
      isRecordTable(value) &&
      (isRecordTable(held) || (isPlainTable(held) && isDefineTable(held)))
    ) {
      active.add(held);
      mergeEntries(held, value, written, active);
      active.delete(held);
    } else {
      map.set(key, value);
    }
  }
}

function fillMissingEntries(
  into: ObjectValue,
  from: ObjectValue,
  written: Written,
  active: Set<ObjectValue>,
): void {
  const map = into.value!;
  for (const [key, value] of from.value!) {
    if (key.startsWith("__")) continue;
    const own = map.get(key);
    if (own === undefined) {
      written(into);
      map.set(key, value);
    } else if (
      own !== value &&
      !active.has(own as ObjectValue) &&
      isRecordTable(own) &&
      isRecordTable(value)
    ) {
      active.add(own);
      fillMissingEntries(own, value, written, active);
      active.delete(own);
    }
  }
}

function mergeIntoRootTable(
  story: any,
  name: string,
  table: ObjectValue,
  written: Written,
): ObjectValue | null {
  const target = rootTableFor(story, name, table);
  if (!target) return null;
  mergeEntries(target, table, written, new Set([target]));
  const into = target.value!;
  for (const [key, member] of into) {
    const meta = metatableMap(member);
    if (
      !(member instanceof ObjectValue) ||
      meta?.get(DEFINE_PARENT_MARKER) == null ||
      coerceString(meta.get(DEFINE_MARKER) ?? null) !== key
    ) {
      continue;
    }
    const chain = defineChain(member);
    if (!chain.includes(target)) continue;
    if (structuralStoreCopies.has(member)) {
      copyStructuralStoreDefaults(member, written);
    } else {
      copyStoreDefaults(chain.slice(1), member, written);
    }
  }
  return target;
}

function joinDisplayParts(table: Map<string, AbstractValue>): boolean {
  const parts = table.get("parts");
  if (!(parts instanceof ObjectValue) || !parts.value) return false;
  let text = "";
  const tags = new Map<string, AbstractValue>();
  const ordered = [...parts.value.entries()].sort(
    ([a], [b]) => Number(a) - Number(b),
  );
  for (const [, part] of ordered) {
    if (part instanceof StringValue) {
      text += part.value ?? "";
    } else if (part instanceof ObjectValue) {
      const tag = part.value?.get("tag");
      if (tag instanceof StringValue) {
        tags.set(String(tags.size + 1), tag);
      }
    }
  }
  table.set("text", new StringValue(text));
  if (tags.size > 0) {
    table.set("tags", new ObjectValue(tags));
  }
  return true;
}

const NOT_JOINED =
  "This line begins with `..`, but the line shown before it does not end with `..`, so it does not join it.";

export const STDLIB: Record<string, StdLibEntry> = {
  "math.abs": { arity: 1, pure: true, fn: (_, [v]) => Math.abs(v) },
  "math.acos": { arity: 1, pure: true, fn: (_, [v]) => Math.acos(v) },
  "math.asin": { arity: 1, pure: true, fn: (_, [v]) => Math.asin(v) },
  "math.atan": {
    arity: -1,
    minArgs: 1,
    pure: true,
    fn: (_, args: number[]) =>
      args.length >= 2 ? Math.atan2(args[0]!, args[1]!) : Math.atan(args[0]!),
  },
  "math.atan2": {
    arity: 2,
    pure: true,
    deprecated:
      "`math.atan2(y, x)` is deprecated in Luau. Use the 2-arg form `math.atan(y, x)` instead.",
    fn: (_, [y, x]) => Math.atan2(y, x),
  },
  "math.ceil": { arity: 1, pure: true, fn: (_, [v]) => Math.ceil(v) },
  "math.cos": { arity: 1, pure: true, fn: (_, [v]) => Math.cos(v) },
  "math.cosh": { arity: 1, pure: true, fn: (_, [v]) => Math.cosh(v) },
  "math.deg": { arity: 1, pure: true, fn: (_, [v]) => (v * 180) / Math.PI },
  "math.exp": { arity: 1, pure: true, fn: (_, [v]) => Math.exp(v) },
  "math.floor": { arity: 1, pure: true, fn: (_, [v]) => Math.floor(v) },
  "math.fmod": { arity: 2, pure: true, fn: (_, [a, b]) => a % b },
  "math.ldexp": {
    arity: 2,
    pure: true,
    fn: (_, [m, e]) => m * Math.pow(2, e),
  },
  "math.modf": {
    arity: 1,
    fn: (_, [x]) => {
      const n = coerceNumber(x) ?? 0;
      const intPart = n >= 0 ? Math.floor(n) : Math.ceil(n);
      return [intPart, n - intPart];
    },
  },
  "math.frexp": {
    arity: 1,
    fn: (_, [x]) => {
      const n = coerceNumber(x) ?? 0;
      if (n === 0 || !isFinite(n) || isNaN(n)) return [n, 0];
      const sign = n < 0 ? -1 : 1;
      const absX = Math.abs(n);
      let e = Math.floor(Math.log2(absX)) + 1;
      let m = absX / Math.pow(2, e);
      // workaround(node): Math.log2 is implementation-approximated, so floor(log2(x))+1 can be off by one near powers of two; frexp corrects the exponent
      if (m >= 1) {
        m /= 2;
        e += 1;
      } else if (m < 0.5) {
        m *= 2;
        e -= 1;
      }
      return [sign * m, e];
    },
  },
  "math.log": {
    arity: -1,
    minArgs: 1,
    pure: true,
    fn: (_, args: number[]) =>
      args.length >= 2 ? Math.log(args[0]!) / Math.log(args[1]!) : Math.log(args[0]!),
  },
  "math.log10": { arity: 1, pure: true, fn: (_, [v]) => Math.log10(v) },
  "math.max": {
    arity: -1,
    minArgs: 1,
    pure: true,
    fn: (_, args: number[]) => {
      let m = args.length > 0 ? args[0]! : -Infinity;
      for (let i = 1; i < args.length; i++) {
        if (args[i]! > m) m = args[i]!;
      }
      return m;
    },
  },
  "math.min": {
    arity: -1,
    minArgs: 1,
    pure: true,
    fn: (_, args: number[]) => {
      let m = args.length > 0 ? args[0]! : Infinity;
      for (let i = 1; i < args.length; i++) {
        if (args[i]! < m) m = args[i]!;
      }
      return m;
    },
  },
  "math.pow": {
    arity: 2,
    pure: true,
    deprecated:
      "`math.pow(a, b)` is deprecated in Luau. Use the `^` exponentiation operator instead (`a ^ b`).",
    fn: (_, [a, b]) => Math.pow(a, b),
  },
  "math.rad": { arity: 1, pure: true, fn: (_, [v]) => (v * Math.PI) / 180 },
  "math.round": {
    arity: 1,
    pure: true,
    fn: (_, [v]) => {
      const a = Math.abs(v);
      const f = Math.floor(a);
      const r = a - f >= 0.5 ? f + 1 : f;
      return v < 0 ? -r : r;
    },
  },
  "math.sign": {
    arity: 1,
    pure: true,
    fn: (_, [v]) => (v > 0 ? 1 : v < 0 ? -1 : 0),
  },
  "math.sin": { arity: 1, pure: true, fn: (_, [v]) => Math.sin(v) },
  "math.sinh": { arity: 1, pure: true, fn: (_, [v]) => Math.sinh(v) },
  "math.sqrt": { arity: 1, pure: true, fn: (_, [v]) => Math.sqrt(v) },
  "math.tan": { arity: 1, pure: true, fn: (_, [v]) => Math.tan(v) },
  "math.tanh": { arity: 1, pure: true, fn: (_, [v]) => Math.tanh(v) },

  "plural.category": {
    arity: 1,
    fn: (story, [nVal]) => {
      const n = coerceNumber(nVal);
      if (n === null) {
        story.Error("plural.category expected a number, but got " + nVal);
        return "other";
      }
      let language = "en";
      const langDirect = coerceString(
        story.state.variablesState.GetVariableWithName("lang.current"),
      );
      if (langDirect !== null) {
        language = langDirect;
      } else {
        const langContainer =
          story.state.variablesState.GetVariableWithName("lang");
        const obj = (langContainer as any)?.value;
        if (obj instanceof Map) {
          const inner = coerceString(obj.get("current"));
          if (inner !== null) language = inner;
        }
      }
      return getPluralCategory(n, language);
    },
  },

  "math.random": {
    arity: -1,
    fn: (story, args) => {
      if (args.length > 2) {
        story.Error("math.random: wrong number of arguments");
        return 0;
      }
      const next = drawStoryRandom(story.state);

      if (args.length === 0) {
        return next / 0x100000000;
      }

      let min: number;
      let max: number;
      if (args.length === 1) {
        const m = coerceNumber(args[0]);
        if (m === null || !Number.isInteger(m)) {
          story.Error("math.random(m): argument must be an integer");
          return 0;
        }
        min = 1;
        max = m;
      } else {
        const m = coerceNumber(args[0]);
        const n = coerceNumber(args[1]);
        if (m === null || !Number.isInteger(m)) {
          story.Error(
            "Invalid value for minimum parameter of math.random(min, max)",
          );
          return 0;
        }
        if (n === null || !Number.isInteger(n)) {
          story.Error(
            "Invalid value for maximum parameter of math.random(min, max)",
          );
          return 0;
        }
        min = m;
        max = n;
      }

      let range = max - min + 1;
      if (!isFinite(range) || range > Number.MAX_SAFE_INTEGER) {
        range = Number.MAX_SAFE_INTEGER;
        story.Error(
          "math.random was called with a range that exceeds the size that ink numbers can use.",
        );
      }
      if (range <= 0) {
        story.Error(
          `math.random was called with minimum as ${min} and maximum as ${max}. The maximum must be larger`,
        );
      }
      return (next % range) + min;
    },
  },

  "math.randomseed": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      const seed = coerceNumber(args[0]);
      if (seed === null) {
        story.Error("Invalid value passed to math.randomseed");
        return;
      }
      story.state.storySeed = seed;
      story.state.previousRandom = 0;
    },
  },

  "count.choices": {
    arity: 0,
    fn: (story) => story.state.generatedChoices.length,
  },

  "count.turns": {
    arity: 0,
    fn: (story) => story.state.currentTurnIndex + 1,
  },

  "math.clamp": {
    arity: 3,
    pure: true,
    fn: (_, [v, min, max]) => Math.min(Math.max(v, min), max),
  },

  "math.map": {
    arity: 5,
    pure: true,
    fn: (_, [x, iMin, iMax, oMin, oMax]) =>
      iMax === iMin
        ? oMin
        : oMin + ((x - iMin) / (iMax - iMin)) * (oMax - oMin),
  },

  "math.noise": {
    arity: -1,
    minArgs: 1,
    pure: true,
    fn: (_, args: number[]) =>
      perlinNoise(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0),
  },

  "math.isnan": {
    arity: 1,
    pure: true,
    fn: (_, [v]) => Number.isNaN(v),
  },
  "math.isinf": {
    arity: 1,
    pure: true,
    fn: (_, [v]) => v === Infinity || v === -Infinity,
  },
  "math.isfinite": {
    arity: 1,
    pure: true,
    fn: (_, [v]) => Number.isFinite(v),
  },

  "math.lerp": {
    arity: 3,
    pure: true,
    fn: (_, [a, b, t]) => (t === 1 ? b : a + t * (b - a)),
  },

  "math.ult": {
    arity: 2,
    pure: true,
    fn: (_, [a, b]) => (a >>> 0) < (b >>> 0),
  },

  tostring: {
    arity: 1,
    fn: (story, [v]) => {
      requireStdLibArg(story, v, 1, "tostring");
      if (v == null) return "nil";
      if (v instanceof ObjectValue && v.metatable instanceof ObjectValue) {
        const handler = (v.metatable.value as Map<string, AbstractValue>)?.get(
          "__tostring",
        );
        if (handler != null && !(handler instanceof NullValue)) {
          const results = story.CallLuauFunction(handler, [v]);
          const first = oneValue(results[0] ?? null);
          if (first instanceof StringValue) return first.value ?? "";
          if (first != null && "value" in (first as any)) {
            const raw = (first as any).value;
            if (typeof raw === "string") return raw;
            if (typeof raw === "number") {
              return STDLIB["tostring"]!.fn(story, [first]);
            }
          }
          story.Error("'__tostring' must return a string");
          return;
        }
      }
      const fnText = functionText(v, (ref) => story.FunctionLabel(ref));
      if (fnText !== null) return fnText;
      if (typeof v === "object" && "value" in v) {
        const map = (v as any).value;
        if (map instanceof Map) {
          return `table: ${luauPointerId(map)}`;
        }
        const raw = (v as any).value;
        if (raw == null) return "nil";
        if (typeof raw === "boolean") return raw ? "true" : "false";
        if (typeof raw === "number") return luauNumberToString(raw);
        return String(raw);
      }
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return luauNumberToString(v);
      return String(v);
    },
  },

  tonumber: {
    arity: 1,
    fn: (_, args) => {
      const v = args[0];
      const baseVal = args.length > 1 ? coerceNumber(args[1]) : null;
      const n = coerceNumber(v);
      if (n !== null && baseVal === null) return n;
      const s = coerceString(v);
      if (s === null) return null;
      if (baseVal !== null) {
        const parsed = parseInt(s, baseVal);
        return Number.isFinite(parsed) ? parsed : null;
      }
      return parseLuauNumber(s);
    },
  },

  type: {
    arity: 1,
    fn: (story, [v]) => {
      requireStdLibArg(story, v, 1, "type");
      return luauTypeOf(v instanceof MultiValue ? v.values[0] : v);
    },
  },

  typeof: {
    arity: 1,
    fn: (story, [v]) => {
      requireStdLibArg(story, v, 1, "typeof");
      return luauTypeOf(v instanceof MultiValue ? v.values[0] : v);
    },
  },

  error: {
    arity: 1,
    validatesArgs: true,
    fn: (story, [msg]) => {
      const raw = coerceString(msg);
      if (raw === null) {
        const value =
          msg == null ? new NullValue() : oneValue(msg as AbstractValue);
        const e = new StoryException(
          `(error object is a ${luauTypeOf(value)} value)`,
        );
        e.errorValue = value;
        throw e;
      }
      const message =
        story.errorMessageFormatter && !story.errorCalledByBuiltin
          ? story.errorMessageFormatter(story, raw)
          : raw;
      story.Error(message);
    },
  },

  rawequal: {
    arity: 2,
    fn: (_, [a, b]) => {
      const av =
        a != null && typeof a === "object" && "value" in a
          ? (a as any).value
          : a;
      const bv =
        b != null && typeof b === "object" && "value" in b
          ? (b as any).value
          : b;
      return av === bv;
    },
  },

  rawlen: {
    arity: 1,
    validatesArgs: true,
    fn: (story, [v]) => {
      if (isPlainTable(v)) {
        const map = v.value as Map<string, any>;
        const hint = (map as any).__luauBoundary;
        story.state.variablesState.PrepareTableWrite?.(v);
        const border = luauTableBorder(map);
        if ((map as any).__luauBoundary !== hint) {
          story.state.variablesState.WriteBarrier(v);
        }
        return border;
      }
      if (v instanceof StringValue) return (v.value ?? "").length;
      return story.Error(
        "invalid argument #1 to 'rawlen' (table or string expected)",
      );
    },
  },

  print: {
    arity: -1,
    fn: (story, args) => {
      const text = args
        .map((a) => luauAnyToDisplayString(story, a))
        .join(" ");
      if (story.state.inStringEvaluation) {
        story.state.PushToOutputStream(new StringValue(text));
        return;
      }
      const table = new ObjectValue(
        new Map<string, AbstractValue>([["text", new StringValue(text)]]),
      );
      story.state.PushToOutputStream(table);
      story.state.PushToOutputStream(new StringValue("\n"));
    },
  },
  display: {
    arity: -1,
    fn: (story, args) => {
      const payload = args[0];
      if (payload instanceof ObjectValue && payload.value) {
        story.state.variablesState.PrepareTableWrite?.(payload);
        if (joinDisplayParts(payload.value)) {
          writtenIn(story)(payload);
        }
      }
      const flag = (key: string) => {
        const value =
          payload instanceof ObjectValue ? payload.value?.get(key) : null;
        return value instanceof BoolValue && value.value === true;
      };
      if (flag("continues")) {
        const state = story.state;
        if (state.lineJoinable) {
          state.JoinLineEnd();
        } else if (
          state.outputStreamContainsContent &&
          !state.outputStreamEndsInNewline &&
          !state.lineEndPending
        ) {
        } else {
          story.Warning(NOT_JOINED);
          writtenIn(story)(payload as ObjectValue);
          (payload as ObjectValue).value?.delete("continues");
        }
      }
      const tags =
        payload instanceof ObjectValue ? payload.value?.get("tags") : null;
      if (tags instanceof ObjectValue && tags.value) {
        const ordered = [...tags.value.entries()].sort(
          ([a], [b]) => Number(a) - Number(b),
        );
        for (const [, tag] of ordered) {
          story.state.PushToOutputStream(ControlCommand.BeginTag());
          if (tag instanceof StringValue) {
            story.state.PushToOutputStream(tag);
          }
          story.state.PushToOutputStream(ControlCommand.EndTag());
        }
      }
      if (payload) {
        story.state.PushToOutputStream(payload);
      }
      if (flag("open")) return;
      if (flag("glue")) {
        story.state.lineEndPending = true;
        story.state.lineJoinable = true;
        return;
      }
      if (flag("caption")) {
        story.state.lineEndPending = true;
        return;
      }
      story.state.PushToOutputStream(new StringValue("\n"));
      if (flag("extend")) story.state.lineJoinable = true;
    },
  },
  __unjoined: {
    arity: 0,
    fn: (story) => {
      story.Warning(NOT_JOINED);
    },
  },
  log: {
    arity: -1,
    fn: (story, args) => {
      const text = args
        .map((a) => luauAnyToDisplayString(story, a))
        .join(" ");
      // eslint-disable-next-line no-console
      console.log(text);
    },
  },

  setmetatable: {
    arity: 2,
    fn: (story, [t, mt]) => {
      if (!(t instanceof ObjectValue)) {
        story.Error("setmetatable: first argument must be a table");
        return;
      }
      if (t.isFrozen) {
        story.Error("setmetatable: attempt to modify a readonly table");
        return;
      }
      const existing = t.metatable;
      if (existing instanceof ObjectValue) {
        const protect = (existing.value as Map<string, AbstractValue>)?.get(
          "__metatable",
        );
        if (protect != null && !(protect instanceof NullValue)) {
          story.Error("setmetatable: cannot change a protected metatable");
          return;
        }
      }
      if (
        mt != null &&
        !(mt instanceof NullValue) &&
        !(mt instanceof ObjectValue)
      ) {
        story.Error("setmetatable: second argument must be a table or nil");
        return;
      }
      writtenIn(story)(t);
      t.metatable = mt instanceof ObjectValue ? mt : null;
      return t;
    },
  },
  getmetatable: {
    arity: 1,
    fn: (story, args) => {
      if (args.length === 0) {
        story.Error("missing argument #1 to 'getmetatable'");
        return;
      }
      const t = args[0];
      if (!(t instanceof ObjectValue)) return new NullValue();
      const mt = t.metatable;
      if (!(mt instanceof ObjectValue)) return new NullValue();
      const protect = (mt.value as Map<string, AbstractValue>)?.get(
        "__metatable",
      );
      if (protect != null && !(protect instanceof NullValue)) {
        return protect;
      }
      return mt;
    },
  },
  newproxy: {
    arity: -1,
    fn: (_, args) => {
      const out = new ObjectValue();
      (out.value as Map<string, AbstractValue>).set(
        "__userdata",
        new BoolValue(true),
      );
      if (args.length === 0) return out;
      const arg = args[0];
      if (arg instanceof ObjectValue) {
        out.metatable = arg;
        return out;
      }
      if (isTruthy(arg)) {
        out.metatable = new ObjectValue();
      }
      return out;
    },
  },
  loadstring: {
    arity: -1,
    minArgs: 1,
    fn: (_, args) => {
      const chunkRaw = args[0];
      const chunk =
        chunkRaw != null &&
        typeof chunkRaw === "object" &&
        "value" in chunkRaw &&
        typeof (chunkRaw as any).value === "string"
          ? ((chunkRaw as any).value as string)
          : "?";
      const firstLine = chunk.split("\n")[0] ?? chunk;
      return [
        new NullValue(),
        new StringValue(
          `[string "${firstLine}"]:1: loadstring is not supported in sparkdown`,
        ),
      ];
    },
  },
  require: {
    arity: -1,
    minArgs: 1,
    fn: (story) =>
      story.Error(
        "require: not yet implemented in sparkdown — use `run \"path\"` for .luau loading",
      ),
  },
  collectgarbage: {
    arity: -1,
    fn: () => 0,
  },
  gcinfo: {
    arity: -1,
    fn: () => 0,
  },
  getfenv: {
    arity: -1,
    fn: () => {
      const proxyMap = new Map<string, AbstractValue>();
      proxyMap.set(GLOBALS_PROXY_TAG, new BoolValue(true));
      return new ObjectValue(proxyMap);
    },
  },
  setfenv: {
    arity: -1,
    minArgs: 2,
    fn: (story) =>
      story.Error(
        "setfenv: removed in Lua 5.2 and not in Luau",
      ),
  },
  "coroutine.create": {
    arity: -1,
    minArgs: 1,
    fn: (story) =>
      story.Error(
        "coroutine.create: not yet implemented in sparkdown (needs fiber / CPS infra)",
      ),
  },
  "coroutine.close": {
    arity: -1,
    minArgs: 1,
    fn: (story) =>
      story.Error("coroutine.close: not yet implemented in sparkdown"),
  },
  "coroutine.isyieldable": {
    arity: -1,
    fn: (story) =>
      story.Error("coroutine.isyieldable: not yet implemented in sparkdown"),
  },
  "coroutine.resume": {
    arity: -1,
    minArgs: 1,
    fn: (story) =>
      story.Error("coroutine.resume: not yet implemented in sparkdown"),
  },
  "coroutine.running": {
    arity: -1,
    fn: (story) =>
      story.Error("coroutine.running: not yet implemented in sparkdown"),
  },
  "coroutine.status": {
    arity: -1,
    minArgs: 1,
    fn: (story) =>
      story.Error("coroutine.status: not yet implemented in sparkdown"),
  },
  "coroutine.wrap": {
    arity: -1,
    minArgs: 1,
    fn: (story) =>
      story.Error("coroutine.wrap: not yet implemented in sparkdown"),
  },
  "coroutine.yield": {
    arity: -1,
    fn: (story) =>
      story.Error("coroutine.yield: not yet implemented in sparkdown"),
  },
  "task.spawn": {
    arity: -1,
    fn: (story) =>
      story.Error("task.spawn: not yet implemented in sparkdown (needs coroutine infra)"),
  },
  "task.defer": {
    arity: -1,
    fn: (story) => story.Error("task.defer: not yet implemented in sparkdown"),
  },
  "task.delay": {
    arity: -1,
    fn: (story) => story.Error("task.delay: not yet implemented in sparkdown"),
  },
  "task.wait": {
    arity: -1,
    fn: (story) => story.Error("task.wait: not yet implemented in sparkdown"),
  },
  "task.cancel": {
    arity: -1,
    fn: (story) => story.Error("task.cancel: not yet implemented in sparkdown"),
  },
  "buffer.create": {
    arity: -1,
    minArgs: 1,
    fn: (story) =>
      story.Error("buffer.create: not yet implemented in sparkdown (needs Buffer ValueType)"),
  },
  "buffer.fromstring": {
    arity: -1,
    minArgs: 1,
    fn: (story) => story.Error("buffer.fromstring: not yet implemented in sparkdown"),
  },
  "buffer.tostring": {
    arity: -1,
    minArgs: 1,
    fn: (story) => story.Error("buffer.tostring: not yet implemented in sparkdown"),
  },
  "buffer.len": {
    arity: -1,
    minArgs: 1,
    fn: (story) => story.Error("buffer.len: not yet implemented in sparkdown"),
  },
  "vector.create": {
    arity: -1,
    minArgs: 3,
    fn: (story) =>
      story.Error("vector.create: not yet implemented in sparkdown (needs Vector ValueType)"),
  },

  pcall: {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      if (args.length === 0) {
        story.Error("pcall: requires a function argument");
        return new MultiValue([
          new BoolValue(false),
          new StringValue("pcall: missing function argument"),
        ]);
      }
      const fn = args[0];
      const callArgs = args.slice(1) as AbstractValue[];
      const result = story.CallLuauFunctionProtected(fn, callArgs);
      if (result.ok) {
        return protectedSuccess(result.values);
      }
      return new MultiValue([
        new BoolValue(false),
        result.errorValue ??
          new StringValue(result.errorMessage ?? "pcall: unknown error"),
      ]);
    },
  },

  xpcall: {
    arity: -1,
    minArgs: 2,
    fn: (story, args) => {
      if (args.length < 2) {
        story.Error("xpcall: requires a function and a message handler");
        return new MultiValue([
          new BoolValue(false),
          new StringValue("xpcall: missing arguments"),
        ]);
      }
      const fn = args[0];
      const msgh = args[1];
      const callArgs = args.slice(2) as AbstractValue[];
      const result = story.CallLuauFunctionProtected(fn, callArgs);
      if (result.ok) {
        return protectedSuccess(result.values);
      }
      const err =
        result.errorValue ??
        new StringValue(result.errorMessage ?? "xpcall: unknown error");
      const handlerResult = story.CallLuauFunctionProtected(msgh, [err]);
      const handled = handlerResult.ok
        ? oneValue(handlerResult.values[0] ?? new NullValue())
        : err;
      return new MultiValue([new BoolValue(false), handled]);
    },
  },

  select: {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      if (args.length === 0) {
        story.Error("select: missing first argument");
        return 0;
      }
      const first = coerceString(args[0]);
      if (first === "#") {
        return args.length - 1;
      }
      const n =
        coerceNumber(args[0]) ??
        (first !== null ? parseLuauNumber(first) : null);
      if (n === null) {
        story.Error(
          'select: first argument must be a positive integer or "#"',
        );
        return 0;
      }
      const rest = args.slice(1);
      let idx = Math.trunc(n);
      if (idx < 0) idx = rest.length + idx + 1;
      if (idx < 1) {
        story.Error("select: index out of range");
        return [];
      }
      return rest.slice(idx - 1);
    },
  },

  rawget: {
    arity: 2,
    fn: (story, [t, k]) => {
      if (t == null || typeof t !== "object" || !("value" in t)) {
        story.Error("rawget: first argument must be a table");
        return null;
      }
      const map = (t as any).value;
      if (!(map instanceof Map)) {
        story.Error("rawget: first argument must be a table");
        return null;
      }
      const key =
        coerceString(k) ??
        (coerceNumber(k) !== null ? String(coerceNumber(k)) : null);
      if (key === null) return null;
      if (map.has(GLOBALS_PROXY_TAG)) {
        return story.state.variablesState.GetGlobalVariableValue(key) ?? null;
      }
      return map.get(key) ?? null;
    },
  },

  rawset: {
    arity: 3,
    fn: (story, [t, k, v]) => {
      if (!(t instanceof ObjectValue) || !(t.value instanceof Map)) {
        story.Error("rawset: first argument must be a table");
        return null;
      }
      if (t.isFrozen) {
        story.Error("rawset: cannot mutate a frozen table");
        return null;
      }
      const key =
        coerceString(k) ??
        (coerceNumber(k) !== null ? String(coerceNumber(k)) : null);
      if (key === null) {
        story.Error("rawset: key must be a string or number");
        return null;
      }
      if (t.value.has(GLOBALS_PROXY_TAG)) {
        story.state.variablesState.SetGlobal(key, v as AbstractValue);
        return t;
      }
      writtenIn(story)(t);
      t.value.set(key, v as AbstractValue);
      return t;
    },
  },

  "string.char": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) => {
      let out = "";
      for (let i = 0; i < args.length; i++) {
        const n = Math.trunc(args[i]!);
        if (!(n >= 0 && n <= 255)) {
          throw new StoryException(
            `invalid argument #${i + 1} to 'char' (value out of range)`,
          );
        }
        out += String.fromCharCode(n);
      }
      return out;
    },
  },
  "string.byte": {
    arity: -1,
    minArgs: 1,
    fn: (_, args) => {
      const s = coerceString(args[0]) ?? "";
      let i = args.length > 1 ? (coerceNumber(args[1]) ?? 1) : 1;
      let j = args.length > 2 ? (coerceNumber(args[2]) ?? i) : i;
      if (i < 0) i = Math.max(1, s.length + i + 1);
      if (j < 0) j = Math.max(0, s.length + j + 1);
      if (i < 1) i = 1;
      if (j > s.length) j = s.length;
      if (j < i) return [];
      const out: number[] = [];
      for (let k = i; k <= j; k++) {
        out.push(s.charCodeAt(k - 1));
      }
      return out;
    },
  },
  "string.len": {
    arity: 1,
    fn: (_, [s]) => (coerceString(s) ?? "").length,
  },
  "string.upper": {
    arity: 1,
    fn: (_, [s]) => (coerceString(s) ?? "").toUpperCase(),
  },
  "string.lower": {
    arity: 1,
    fn: (_, [s]) => (coerceString(s) ?? "").toLowerCase(),
  },
  "string.reverse": {
    arity: 1,
    fn: (_, [s]) =>
      (coerceString(s) ?? "")
        .split("")
        .reverse()
        .join(""),
  },
  "string.rep": {
    arity: -1,
    minArgs: 2,
    fn: (_, args) => {
      const s = coerceString(args[0]) ?? "";
      const n = Math.max(0, Math.floor(coerceNumber(args[1]) ?? 0));
      if (n === 0) return "";
      const sep = args.length >= 3 ? (coerceString(args[2]) ?? "") : "";
      const total = (s.length + sep.length) * n;
      if (s.length > 0 && total > PACK_MAXSSIZE) {
        throw new StoryException("resulting string too large");
      }
      if (sep === "") return s.repeat(n);
      return new Array(n).fill(s).join(sep);
    },
  },
  "string.sub": {
    arity: -1,
    minArgs: 1,
    fn: (_, args) => {
      const str = coerceString(args[0]) ?? "";
      let i = checkNumberArg(args[1], 2, "sub");
      let j = checkNumberArg(args[2], 3, "sub", true) ?? -1;
      if (i < 0) i = Math.max(str.length + i + 1, 1);
      else if (i === 0) i = 1;
      if (j < 0) j = str.length + j + 1;
      else if (j > str.length) j = str.length;
      if (j < i) return "";
      return str.slice(i - 1, j);
    },
  },
  "string.find": {
    arity: -1,
    minArgs: 2,
    fn: (story, args) => {
      const s = coerceString(args[0]) ?? "";
      const patternStr = coerceString(args[1]) ?? "";
      const init = resolveInit(args[2], s.length);
      const plain = isTruthy(args[3]);
      if (plain) {
        const idx = s.indexOf(patternStr, init - 1);
        if (idx < 0) return new NullValue();
        return new MultiValue([
          new IntValue(idx + 1),
          new IntValue(idx + patternStr.length),
        ]);
      }
      let compiled;
      try {
        compiled = luaPatternToJs(patternStr);
      } catch (e) {
        if (e instanceof LuaPatternError) {
          story.Error(`string.find: ${e.message}`);
          return new NullValue();
        }
        throw e;
      }
      const matched = executeLuaPattern(compiled, s, init - 1);
      if (!matched) return new NullValue();
      const results: AbstractValue[] = [
        new IntValue(matched.index + 1),
        new IntValue(matched.index + matched.length),
        ...patternCapturesToValues(matched),
      ];
      return new MultiValue(results);
    },
  },
  "string.match": {
    arity: -1,
    minArgs: 2,
    fn: (story, args) => {
      const s = coerceString(args[0]) ?? "";
      const patternStr = coerceString(args[1]) ?? "";
      const init = resolveInit(args[2], s.length);
      let compiled;
      try {
        compiled = luaPatternToJs(patternStr);
      } catch (e) {
        if (e instanceof LuaPatternError) {
          story.Error(`string.match: ${e.message}`);
          return new NullValue();
        }
        throw e;
      }
      const matched = executeLuaPattern(compiled, s, init - 1);
      if (!matched) return new NullValue();
      if (compiled.captureCount === 0) {
        return new StringValue(
          s.slice(matched.index, matched.index + matched.length),
        );
      }
      const captures = patternCapturesToValues(matched);
      return captures.length === 1
        ? captures[0]!
        : new MultiValue(captures);
    },
  },
  "string.gsub": {
    arity: -1,
    minArgs: 3,
    fn: (story, args) => {
      const input = coerceString(args[0]) ?? "";
      const patternStr = coerceString(args[1]) ?? "";
      const replArg = args[2];
      const maxN = args.length > 3 ? coerceNumber(args[3]) : null;
      let compiled;
      try {
        compiled = luaPatternToJs(patternStr);
      } catch (e) {
        if (e instanceof LuaPatternError) {
          story.Error(`string.gsub: ${e.message}`);
          return new MultiValue([new StringValue(input), new IntValue(0)]);
        }
        throw e;
      }
      const replKind = classifyGsubRepl(replArg, story);
      if (replKind === "error")
        return new MultiValue([new StringValue(input), new IntValue(0)]);

      const out: string[] = [];
      let cursor = 0;
      let count = 0;
      while (cursor <= input.length) {
        if (maxN != null && count >= maxN) break;
        const matched = executeLuaPattern(compiled, input, cursor);
        if (!matched) break;
        const matchStart = matched.index;
        const matchEnd = matchStart + matched.length;
        const wholeMatch = input.slice(matchStart, matchEnd);
        if (matchStart > cursor) out.push(input.slice(cursor, matchStart));
        let replacement: string | null;
        if (replKind === "string") {
          replacement = expandGsubStringRepl(
            coerceString(replArg) ?? "",
            matched,
            wholeMatch,
            story,
          );
          if (replacement == null)
            return new MultiValue([new StringValue(input), new IntValue(0)]);
        } else if (replKind === "function") {
          const callArgs: AbstractValue[] =
            compiled.captureCount === 0
              ? [new StringValue(wholeMatch)]
              : matched.captures.map((c) => {
                  if (c == null) return new NullValue();
                  if (typeof c === "number") return new IntValue(c);
                  return new StringValue(c);
                });
          let results: AbstractValue[];
          try {
            results = story.CallLuauFunction(replArg, callArgs);
          } catch (e) {
            if (e instanceof StepLimitExceeded) throw e;
            story.ErrorFrom(
              `string.gsub: replacement function threw: ${(e as Error).message}`,
              e,
            );
            return new MultiValue([new StringValue(input), new IntValue(0)]);
          }
          let top = results[0];
          if (top instanceof MultiValue) top = top.values[0];
          if (
            top == null ||
            top instanceof NullValue ||
            top instanceof Void ||
            (top as any).value === false
          ) {
            replacement = wholeMatch;
          } else {
            const raw = (top as any).value;
            if (typeof raw === "string") replacement = raw;
            else if (typeof raw === "number") replacement = String(raw);
            else {
              story.Error(
                "string.gsub: replacement function must return a string, number, or nil",
              );
              return new MultiValue([
                new StringValue(input),
                new IntValue(0),
              ]);
            }
          }
        } else {
          let lookupKey: string;
          if (compiled.captureCount === 0) {
            lookupKey = wholeMatch;
          } else {
            const cap = matched.captures[0];
            lookupKey = cap == null ? "" : String(cap);
          }
          const lookup = gsubTableLookup(
            story,
            replArg as ObjectValue,
            lookupKey,
          );
          if (
            lookup == null ||
            lookup instanceof NullValue ||
            (lookup as any).value === false
          ) {
            replacement = wholeMatch;
          } else {
            const raw = (lookup as any).value;
            if (typeof raw === "string") replacement = raw;
            else if (typeof raw === "number") replacement = String(raw);
            else {
              story.Error(
                `string.gsub: invalid replacement value for key "${lookupKey}" — table values must be strings or numbers`,
              );
              return new MultiValue([
                new StringValue(input),
                new IntValue(0),
              ]);
            }
          }
        }
        out.push(replacement);
        count++;
        if (matched.length === 0) {
          if (matchStart < input.length) out.push(input.charAt(matchStart));
          cursor = matchStart + 1;
        } else {
          cursor = matchEnd;
        }
      }
      if (cursor < input.length) out.push(input.slice(cursor));
      return new MultiValue([
        new StringValue(out.join("")),
        new IntValue(count),
      ]);
    },
  },
  "string.gmatch": {
    arity: 2,
    fn: (story, [sArg, patArg]) => {
      const input = coerceString(sArg) ?? "";
      const pattern = coerceString(patArg) ?? "";
      try {
        luaPatternToJs(pattern);
      } catch (e) {
        if (e instanceof LuaPatternError) {
          story.Error(`string.gmatch: ${e.message}`);
          return new NullValue();
        }
        throw e;
      }
      const stateMap = new Map<string, AbstractValue>();
      stateMap.set(GMATCH_INPUT, new StringValue(input));
      stateMap.set(GMATCH_PATTERN, new StringValue(pattern));
      const iterMap = new Map<string, AbstractValue>();
      iterMap.set(BUILTIN_ITER_TAG, new StringValue("gmatch"));
      iterMap.set(BUILTIN_ITER_STATE, new ObjectValue(stateMap));
      iterMap.set(BUILTIN_ITER_CURSOR, new IntValue(0));
      return new ObjectValue(iterMap);
    },
  },
  "string.format": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      const fmt = coerceString(args[0]) ?? "";
      const rest = args.slice(1);
      return formatLuaString(story, fmt, rest);
    },
  },
  "string.split": {
    arity: -1,
    minArgs: 1,
    fn: (_, args) => {
      const str = coerceString(args[0]) ?? "";
      const sep = args.length > 1 ? (coerceString(args[1]) ?? "") : "";
      const parts = sep === "" ? Array.from(str) : str.split(sep);
      const map = new Map<string, AbstractValue>();
      for (let i = 0; i < parts.length; i++) {
        map.set(String(i + 1), new StringValue(parts[i]!));
      }
      return new ObjectValue(map);
    },
  },
  "string.contains": {
    arity: 2,
    pure: ["string"],
    fn: (_, [s, sub]) =>
      (coerceString(s) ?? "").includes(coerceString(sub) ?? ""),
  },
  "string.startswith": {
    arity: 2,
    pure: ["string"],
    fn: (_, [s, prefix]) =>
      (coerceString(s) ?? "").startsWith(coerceString(prefix) ?? ""),
  },
  "string.endswith": {
    arity: 2,
    pure: ["string"],
    fn: (_, [s, suffix]) =>
      (coerceString(s) ?? "").endsWith(coerceString(suffix) ?? ""),
  },
  "string.trim": {
    arity: 1,
    pure: ["string"],
    fn: (_, [s]) => (coerceString(s) ?? "").trim(),
  },
  "string.trimstart": {
    arity: 1,
    pure: ["string"],
    fn: (_, [s]) => (coerceString(s) ?? "").trimStart(),
  },
  "string.trimend": {
    arity: 1,
    pure: ["string"],
    fn: (_, [s]) => (coerceString(s) ?? "").trimEnd(),
  },
  "string.pack": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      const fmt = coerceString(args[0]) ?? "";
      const result = packString(fmt, args.slice(1), story);
      return result == null ? "" : result;
    },
  },
  "string.unpack": {
    arity: -1,
    minArgs: 2,
    fn: (story, args) => {
      const fmt = coerceString(args[0]) ?? "";
      const data = coerceString(args[1]) ?? "";
      const pos = args.length > 2 ? (coerceNumber(args[2]) ?? 1) : 1;
      const result = unpackString(fmt, data, pos, story);
      if (result == null) return new NullValue();
      return new MultiValue([
        ...result.values,
        new IntValue(result.nextPos),
      ]);
    },
  },
  "string.packsize": {
    arity: 1,
    fn: (story, [fmtArg]) => {
      const fmt = coerceString(fmtArg) ?? "";
      const size = packSize(fmt, story);
      return size == null ? 0 : size;
    },
  },

  "bit32.bnot": { arity: 1, pure: true, fn: (_, [v]) => (~v) >>> 0 },
  "bit32.lshift": {
    arity: 2,
    pure: true,
    fn: (_, [v, n]) => luaLshift(v, n),
  },
  "bit32.rshift": {
    arity: 2,
    pure: true,
    fn: (_, [v, n]) => luaRshift(v, n),
  },
  "bit32.arshift": {
    arity: 2,
    pure: true,
    fn: (_, [v, n]) => {
      const x = v >>> 0;
      const c = Math.trunc(n);
      if (c < 0) return luaLshift(x, -c);
      if (c >= 32) return x & 0x80000000 ? 0xffffffff : 0;
      return ((x | 0) >> c) >>> 0;
    },
  },
  "bit32.byteswap": {
    arity: 1,
    pure: true,
    fn: (_, [v]) => {
      const x = v >>> 0;
      return (
        (((x >>> 24) & 0xff) |
          ((x >>> 8) & 0xff00) |
          ((x & 0xff00) << 8) |
          ((x & 0xff) << 24)) >>> 0
      );
    },
  },
  "bit32.countlz": {
    arity: 1,
    pure: true,
    fn: (_, [v]) => {
      const x = v >>> 0;
      if (x === 0) return 32;
      return Math.clz32(x);
    },
  },
  "bit32.countrz": {
    arity: 1,
    pure: true,
    fn: (_, [v]) => {
      const x = v >>> 0;
      if (x === 0) return 32;
      return 31 - Math.clz32(x & -x);
    },
  },
  "bit32.lrotate": {
    arity: 2,
    pure: true,
    fn: (_, [v, n]) => {
      const x = v >>> 0;
      const r = ((n % 32) + 32) % 32;
      return ((x << r) | (x >>> (32 - r))) >>> 0;
    },
  },
  "bit32.rrotate": {
    arity: 2,
    pure: true,
    fn: (_, [v, n]) => {
      const x = v >>> 0;
      const r = ((n % 32) + 32) % 32;
      return ((x >>> r) | (x << (32 - r))) >>> 0;
    },
  },
  "bit32.band": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) => {
      let r = 0xffffffff;
      for (const n of args) r &= n >>> 0;
      return r >>> 0;
    },
  },
  "bit32.bor": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) => {
      let r = 0;
      for (const n of args) r |= n >>> 0;
      return r >>> 0;
    },
  },
  "bit32.bxor": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) => {
      let r = 0;
      for (const n of args) r ^= n >>> 0;
      return r >>> 0;
    },
  },
  "bit32.btest": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) => {
      let r = 0xffffffff;
      for (const n of args) r &= n >>> 0;
      return r !== 0;
    },
  },
  "bit32.extract": {
    arity: -1,
    minArgs: 2,
    pure: true,
    fn: (_, args: number[]) => {
      const n = (args[0] ?? 0) >>> 0;
      const field = Math.trunc(args[1] ?? 0);
      const width = Math.trunc(args.length > 2 ? (args[2] ?? 1) : 1);
      checkBitField(field, width, "extract");
      const mask = width >= 32 ? 0xffffffff : ((1 << width) - 1) >>> 0;
      return ((n >>> field) & mask) >>> 0;
    },
  },
  "bit32.replace": {
    arity: -1,
    minArgs: 3,
    pure: true,
    fn: (_, args: number[]) => {
      let n = (args[0] ?? 0) >>> 0;
      const v = (args[1] ?? 0) >>> 0;
      const field = Math.trunc(args[2] ?? 0);
      const width = Math.trunc(args.length > 3 ? (args[3] ?? 1) : 1);
      checkBitField(field, width, "replace");
      const mask = width >= 32 ? 0xffffffff : ((1 << width) - 1) >>> 0;
      const shiftedMask = (mask << field) >>> 0;
      n = (n & ~shiftedMask) >>> 0;
      n = (n | ((v & mask) << field)) >>> 0;
      return n;
    },
  },

  "table.getn": {
    arity: 1,
    deprecated:
      "`table.getn(t)` is deprecated in Luau. Use the length operator `#t` instead.",
    fn: (story, [t]) => {
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("table.getn: argument must be a table");
        return 0;
      }
      let n = 0;
      while (map.has(String(n + 1))) n++;
      return n;
    },
  },
  "table.maxn": {
    arity: 1,
    deprecated:
      "`table.maxn(t)` is deprecated in Luau. If you need to scan sparse integer keys, write the loop explicitly with `pairs`.",
    fn: (story, [t]) => {
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("table.maxn: argument must be a table");
        return 0;
      }
      let max = 0;
      for (const k of map.keys()) {
        const n = Number(k);
        if (Number.isFinite(n) && n > max) max = n;
      }
      return max;
    },
  },
  "table.concat": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      const t = args[0];
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("table.concat: first argument must be a table");
        return "";
      }
      let sep = "";
      if (args.length > 1 && args[1] != null && !(args[1] instanceof NullValue)) {
        const s = coerceString(args[1]);
        if (s === null) {
          story.Error(
            "table.concat: invalid argument #2 to 'concat' (string expected)",
          );
          return "";
        }
        sep = s;
      }
      const i = args.length > 2 ? (coerceNumber(args[2]) ?? 1) : 1;
      let len = 0;
      while (map.has(String(len + 1))) len++;
      const j = args.length > 3 ? (coerceNumber(args[3]) ?? len) : len;
      const parts: string[] = [];
      for (let k = i; k <= j; k++) {
        const v = map.get(String(k));
        const sv = coerceString(v);
        if (sv !== null) {
          parts.push(sv);
          continue;
        }
        const nv = coerceNumber(v);
        if (nv !== null) {
          parts.push(String(nv));
          continue;
        }
        story.Error(
          `table.concat: invalid value (not a string or number) at index ${k}`,
        );
        return "";
      }
      return parts.join(sep);
    },
  },
  "table.find": {
    arity: -1,
    minArgs: 2,
    fn: (story, args) => {
      const t = args[0];
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("table.find: first argument must be a table");
        return null;
      }
      const target = args[1];
      const targetRaw =
        target != null && typeof target === "object" && "value" in target
          ? (target as any).value
          : target;
      const init = args.length > 2 ? (coerceNumber(args[2]) ?? 1) : 1;
      if (init < 1) {
        story.Error("table.find: index out of range");
        return null;
      }
      const eqViaMetamethod = (a: any, b: any): boolean => {
        if (!(a instanceof ObjectValue) || !(b instanceof ObjectValue)) {
          return false;
        }
        if (luauTypeOf(a) !== luauTypeOf(b)) return false;
        const handlerOf = (o: ObjectValue) =>
          o.metatable instanceof ObjectValue
            ? ((o.metatable.value as Map<string, AbstractValue>)?.get(
                "__eq",
              ) ?? null)
            : null;
        const ha = handlerOf(a);
        const hb = handlerOf(b);
        if (ha == null || hb == null || ha instanceof NullValue) return false;
        const same =
          ha === hb ||
          ((ha as any).value != null && (ha as any).value === (hb as any).value);
        if (!same) return false;
        const results = story.CallLuauFunction(ha, [a, b]);
        const top = oneValue(results?.[0] ?? null);
        return (
          top != null &&
          !(top instanceof NullValue) &&
          (top as any).value !== false
        );
      };
      let k = init;
      while (map.has(String(k))) {
        const v = map.get(String(k));
        const raw =
          v != null && typeof v === "object" && "value" in v
            ? (v as any).value
            : v;
        if (raw === targetRaw || eqViaMetamethod(v, target)) return k;
        k++;
      }
      return null;
    },
  },
  "table.foreach": {
    arity: 2,
    deprecated:
      "`table.foreach` is deprecated in Luau. Use `for k, v in pairs(t) do … end`.",
    fn: (story, [t, fn]) => {
      if (!(t instanceof ObjectValue)) {
        story.Error("table.foreach: first argument must be a table");
        return new NullValue();
      }
      const map = t.value as Map<string, AbstractValue>;
      for (const [k, v] of map) {
        const keyValue: AbstractValue = /^-?\d+$/.test(k)
          ? new IntValue(parseInt(k, 10))
          : new StringValue(k);
        const results = story.CallLuauFunction(fn, [keyValue, v]);
        const top = oneValue(results[0] ?? null);
        if (
          top != null &&
          !(top instanceof NullValue) &&
          !(top instanceof Void)
        ) {
          return top;
        }
      }
      return new NullValue();
    },
  },
  "table.foreachi": {
    arity: 2,
    deprecated:
      "`table.foreachi` is deprecated in Luau. Use `for i, v in ipairs(t) do … end`.",
    fn: (story, [t, fn]) => {
      if (!(t instanceof ObjectValue)) {
        story.Error("table.foreachi: first argument must be a table");
        return new NullValue();
      }
      const map = t.value as Map<string, AbstractValue>;
      let i = 1;
      while (map.has(String(i))) {
        const v = map.get(String(i))! as AbstractValue;
        const results = story.CallLuauFunction(fn, [new IntValue(i), v]);
        const top = oneValue(results[0] ?? null);
        if (
          top != null &&
          !(top instanceof NullValue) &&
          !(top instanceof Void)
        ) {
          return top;
        }
        i++;
      }
      return new NullValue();
    },
  },
  "table.insert": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      if (!(args[0] instanceof ObjectValue)) {
        story.Error("table.insert: first argument must be a table");
        return undefined;
      }
      const t = args[0];
      if (t.isFrozen) {
        story.Error("table.insert: cannot mutate a frozen table");
        return undefined;
      }
      const map = t.value!;
      let len = 0;
      while (map.has(String(len + 1))) len++;
      let pos: number;
      let value: any;
      if (args.length === 2) {
        pos = len + 1;
        value = args[1];
      } else if (args.length === 3) {
        const p = coerceNumber(args[1]);
        if (p === null) {
          story.Error("table.insert: position must be a number");
          return undefined;
        }
        pos = Math.trunc(p);
        value = args[2];
        if (pos >= 1 && pos <= len) {
          writtenIn(story)(t);
          for (let k = len; k >= pos; k--) {
            const existing = map.get(String(k));
            if (existing !== undefined) {
              map.set(String(k + 1), existing);
            }
          }
        }
      } else if (args.length > 3) {
        story.Error("wrong number of arguments to 'insert'");
        return undefined;
      } else {
        story.Error("table.insert: missing value argument");
        return undefined;
      }
      writtenIn(story)(t);
      map.set(String(pos), value);
      return undefined;
    },
  },
  "table.remove": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      if (!(args[0] instanceof ObjectValue)) {
        story.Error("table.remove: first argument must be a table");
        return null;
      }
      const t = args[0];
      if (t.isFrozen) {
        story.Error("table.remove: cannot mutate a frozen table");
        return null;
      }
      const map = t.value!;
      let len = 0;
      while (map.has(String(len + 1))) len++;
      if (len === 0) return null;
      let pos: number;
      if (args.length < 2) {
        pos = len;
      } else {
        const p = coerceNumber(args[1]);
        if (p === null || !Number.isInteger(p)) {
          story.Error("table.remove: position must be an integer");
          return null;
        }
        pos = p;
      }
      if (pos < 1 || pos > len) return null;
      writtenIn(story)(t);
      const removed = map.get(String(pos)) ?? null;
      for (let k = pos; k < len; k++) {
        const next = map.get(String(k + 1));
        if (next !== undefined) {
          map.set(String(k), next);
        } else {
          map.delete(String(k));
        }
      }
      map.delete(String(len));
      return removed;
    },
  },
  "table.sort": {
    arity: -1,
    validatesArgs: true,
    fn: (story, args) => {
      const t = requireTableArg(story, args[0], 1, "sort");
      const cmpArg = args[1];
      if (
        cmpArg !== undefined &&
        !(cmpArg instanceof NullValue) &&
        !(cmpArg instanceof Void)
      ) {
        const cmpType = luauTypeOf(cmpArg);
        if (cmpType !== "function") {
          story.Error(
            `invalid argument #2 to 'sort' (function expected, got ${cmpType})`,
          );
          return undefined;
        }
      }
      if (t.isFrozen) {
        story.Error("attempt to modify a readonly table");
        return undefined;
      }
      const map = t.value!;
      let len = 0;
      while (map.has(String(len + 1))) len++;
      if (len < 2) return undefined;
      const arr: AbstractValue[] = [];
      for (let k = 1; k <= len; k++) {
        arr.push(map.get(String(k)) as AbstractValue);
      }
      const compArg = args.length > 1 ? args[1] : null;
      const comp =
        compArg == null || compArg instanceof NullValue ? null : compArg;
      const defaultLess = (a: AbstractValue, b: AbstractValue): boolean => {
        const av = (a as any)?.value;
        const bv = (b as any)?.value;
        if (typeof av === "number" && typeof bv === "number") return av < bv;
        if (typeof av === "string" && typeof bv === "string") return av < bv;
        const mt =
          luauTypeOf(a) === luauTypeOf(b)
            ? (a as { metatable?: any })?.metatable
            : null;
        const ltFn =
          mt != null && mt.value instanceof Map ? mt.value.get("__lt") : null;
        if (ltFn != null && !(ltFn instanceof NullValue)) {
          const results = story.CallLuauFunction(ltFn, [a, b]) as
            | AbstractValue[]
            | null;
          const top = oneValue(results?.[0] ?? null);
          return top != null && isTruthy(top);
        }
        story.Error(
          `attempt to compare two ${luauTypeOf(a)} values`,
        );
        return false;
      };
      let aborted = false;
      const less = (a: AbstractValue, b: AbstractValue): boolean => {
        if (comp == null) return defaultLess(a, b);
        try {
          const results = story.CallLuauFunction(comp, [a, b]);
          const top = oneValue(results[0] ?? null);
          if (top == null) return false;
          return isTruthy(top);
        } catch (e) {
          if (e instanceof StepLimitExceeded) throw e;
          story.ErrorFrom(
            `table.sort: comparator threw: ${(e as Error).message}`,
            e,
          );
          aborted = true;
          return false;
        }
      };
      arr.sort((a, b) => {
        if (aborted) return 0;
        if (less(a, b)) return -1;
        if (less(b, a)) return 1;
        return 0;
      });
      if (aborted) return undefined;
      writtenIn(story)(t);
      for (let k = 1; k <= len; k++) {
        map.set(String(k), arr[k - 1]!);
      }
      return undefined;
    },
  },
  "table.clear": {
    arity: 1,
    validatesArgs: true,
    fn: (story, [tArg]) => {
      const t = requireTableArg(story, tArg, 1, "clear");
      if (t.isFrozen) {
        story.Error("table.clear: cannot mutate a frozen table");
        return undefined;
      }
      const map = t.value!;
      let len = 0;
      while (map.has(String(len + 1))) len++;
      const prevCap = (map as any).__luauCapacity ?? 0;
      writtenIn(story)(t);
      map.clear();
      (map as any).__luauCapacity = Math.max(prevCap, len);
      (map as any).__luauBoundary = 0;
      return undefined;
    },
  },
  "table.clone": {
    arity: 1,
    fn: (story, [t]) => {
      if (!(t instanceof ObjectValue)) {
        story.Error("table.clone: argument must be a table");
        return null;
      }
      if (t.metatable instanceof ObjectValue) {
        const protect = (
          t.metatable.value as Map<string, AbstractValue>
        )?.get("__metatable");
        if (protect != null && !(protect instanceof NullValue)) {
          story.Error("table.clone: table has a protected metatable");
          return null;
        }
      }
      const next = new Map<string, AbstractValue>();
      for (const [k, v] of t.value!) next.set(k, v);
      const clone = new ObjectValue(next);
      clone.metatable = t.metatable ?? null;
      return clone;
    },
  },
  "table.create": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      const count = coerceNumber(args[0]);
      if (count === null || !Number.isInteger(count) || count < 0) {
        story.Error(
          "table.create: first argument must be a non-negative integer",
        );
        return null;
      }
      if (count > 2 ** 26) {
        story.Error("table.create: size out of range");
        return null;
      }
      const map = new Map<string, AbstractValue>();
      const value = args.length > 1 ? args[1] : null;
      const valueIsNil =
        value === null ||
        value === undefined ||
        (value != null &&
          typeof value === "object" &&
          "value" in value &&
          (value as any).value === null);
      if (!valueIsNil) {
        for (let k = 1; k <= count; k++) {
          map.set(String(k), value as AbstractValue);
        }
        (map as any).__luauBoundary = count;
      }
      (map as any).__luauCapacity = count;
      return new ObjectValue(map);
    },
  },
  "table.pack": {
    arity: -1,
    fn: (_, args) => {
      const map = new Map<string, AbstractValue>();
      for (let i = 0; i < args.length; i++) {
        map.set(String(i + 1), args[i] as AbstractValue);
      }
      map.set("n", new IntValue(args.length));
      return new ObjectValue(map);
    },
  },
  "table.move": {
    arity: -1,
    fn: (story, args) => {
      const INT_MAX = 2147483647;
      const checkInt = (v: any, idx: number): number => {
        const missing =
          v === undefined ||
          v instanceof Void ||
          (v instanceof MultiValue && v.values.length === 0);
        if (missing) {
          story.Error(`missing argument #${idx} to 'move' (number expected)`);
        }
        const raw = v instanceof MultiValue ? v.values[0] : v;
        const n = coerceNumber(raw);
        if (n === null) {
          story.Error(
            `invalid argument #${idx} to 'move' (number expected, got ${luauTypeOf(raw)})`,
          );
        }
        return Math.trunc(n!);
      };
      const f = checkInt(args[1], 2);
      const e = checkInt(args[2], 3);
      const t = checkInt(args[3], 4);
      const a1 = requireTableArg(story, args[0], 1, "move");
      const a5 = args.length > 4 ? args[4] : undefined;
      const a5Absent =
        a5 === undefined ||
        a5 instanceof NullValue ||
        a5 instanceof Void;
      const a2 = a5Absent ? a1 : requireTableArg(story, a5, 5, "move");
      if (e >= f) {
        // Luau: luaL_argcheck(f > 0 || e < INT_MAX + f, 3, ...)
        if (!(f > 0 || e < INT_MAX + f)) {
          story.Error(
            "invalid argument #3 to 'move' (too many elements to move)",
          );
        }
        const n = e - f + 1;
        if (!(t <= INT_MAX - n + 1)) {
          story.Error("invalid argument #4 to 'move' (destination wrap around)");
        }
        if (a2.isFrozen) {
          story.Error("attempt to modify a readonly table");
        }
        const src = a1.value!;
        const dst = a2.value!;
        const copy = (i: number) => {
          const v = src.get(String(f + i));
          const dk = String(t + i);
          if (v !== undefined) dst.set(dk, v);
          else dst.delete(dk);
        };
        writtenIn(story)(a2);
        if (t > e || t <= f || dst !== src) {
          for (let i = 0; i < n; i++) copy(i);
        } else {
          for (let i = n - 1; i >= 0; i--) copy(i);
        }
      }
      return a2;
    },
  },
  "table.freeze": {
    arity: 1,
    fn: (story, [t]) => {
      if (!(t instanceof ObjectValue)) {
        story.Error("table.freeze: argument must be a table");
        return t;
      }
      if (t.isFrozen) {
        story.Error("table.freeze: table is already frozen");
        return t;
      }
      if (t.metatable instanceof ObjectValue) {
        const protect = (
          t.metatable.value as Map<string, AbstractValue>
        )?.get("__metatable");
        if (protect != null && !(protect instanceof NullValue)) {
          story.Error("table.freeze: table has a protected metatable");
          return t;
        }
      }
      writtenIn(story)(t);
      t.Freeze();
      return t;
    },
  },
  "table.isfrozen": {
    arity: 1,
    fn: (_, [t]) => t instanceof ObjectValue && t.isFrozen,
  },
  "table.unpack": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => unpackImpl(story, args, "table.unpack"),
  },
  unpack: {
    arity: -1,
    minArgs: 1,
    deprecated:
      "The global `unpack` is deprecated in Luau. Use `table.unpack(t)` instead.",
    fn: (story, args) => unpackImpl(story, args, "unpack"),
  },

  next: {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      const t = args[0];
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("next: first argument must be a table");
        return new NullValue();
      }
      const keys = Array.from(map.keys());
      const kArg = args[1];
      const isNilKey =
        kArg == null ||
        kArg instanceof NullValue ||
        (kArg as any)?.value === null;
      let idx: number;
      if (isNilKey) {
        idx = 0;
      } else {
        const kStr =
          typeof (kArg as any).value === "string"
            ? (kArg as any).value
            : String((kArg as any).value);
        const i = keys.indexOf(kStr);
        idx = i < 0 ? keys.length : i + 1;
      }
      if (idx >= keys.length) return new NullValue();
      const nextKey = keys[idx]!;
      const nextValue = map.get(nextKey)!;
      const keyValue: AbstractValue = /^-?\d+$/.test(nextKey)
        ? new IntValue(parseInt(nextKey, 10))
        : new StringValue(nextKey);
      return new MultiValue([keyValue, nextValue as AbstractValue]);
    },
  },
  "__new": {
    arity: -1,
    fn: (story, args) => {
      const cls = args[0];
      if (!(cls instanceof ObjectValue)) {
        story.Error(
          `new: ${luauTypeOf(cls)} value is not a class (expected a \`define\`d type name)`,
        );
        return null;
      }
      const inst = new ObjectValue(new Map<string, AbstractValue>());
      const mtMap = new Map<string, AbstractValue>();
      mtMap.set("__index", cls);
      inst.metatable = new ObjectValue(mtMap);

      const chain = defineChain(cls);
      copyStoreDefaults(chain, inst);

      for (const level of chain) {
        const init = (level.value as Map<string, AbstractValue>)?.get("init");
        if (init != null && !(init instanceof NullValue)) {
          story.CallLuauFunction(init, [
            inst,
            ...(args.slice(1) as AbstractValue[]),
          ]);
          break;
        }
      }
      return inst;
    },
  },
  "__def": {
    arity: 3,
    fn: (story, [tableArg, nameArg, parentArg]) => {
      if (!(tableArg instanceof ObjectValue)) return tableArg ?? null;
      const table = tableArg;
      const name = coerceString(nameArg) ?? "";
      const parentName = coerceString(parentArg) ?? "";

      const mt = new Map<string, AbstractValue>();
      mt.set(DEFINE_MARKER, new StringValue(name));
      if (parentName) mt.set(DEFINE_PARENT_MARKER, new StringValue(parentName));

      let parent: ObjectValue | null = null;
      if (parentName) {
        const existing = story.state.variablesState.GetVariableWithName(
          parentName,
        ) as AbstractValue | null;
        if (existing instanceof ObjectValue) {
          parent = resolveParentType(story, parentName, existing);
        } else {
          parent = new ObjectValue(new Map<string, AbstractValue>());
          const pmt = new Map<string, AbstractValue>();
          pmt.set(DEFINE_MARKER, new StringValue(parentName));
          parent.metatable = new ObjectValue(pmt);
          story.state.variablesState.SetGlobal(parentName, parent);
        }
        mt.set("__index", parent);
      }
      const written = writtenIn(story);
      written(table);
      table.metatable = new ObjectValue(mt);

      if (parent) {
        const replaced = parent.value!.get(name);
        if (
          replaced instanceof ObjectValue &&
          replaced !== table &&
          isPlainTable(replaced) &&
          isDefineTable(replaced)
        ) {
          fillMissingEntries(table, replaced, written, new Set([table]));
        }
        const chain = defineChain(parent);
        copyStoreDefaults(chain, table, written);
        for (const level of chain) {
          written(level);
          level.value!.set(name, table);
        }
        for (const level of chain) {
          linkWaitingStructuralChildren(level, name, table, written);
        }
      } else if (name) {
        const merged = mergeIntoRootTable(story, name, table, written);
        if (merged) return merged;
      }
      return table;
    },
  },
  "__defs": {
    arity: 4,
    fn: (story, [tableArg, nameArg, typeArg, parentArg]) => {
      if (!(tableArg instanceof ObjectValue)) return tableArg ?? null;
      const table = tableArg;
      const name = coerceString(nameArg) ?? "";
      const typeName = coerceString(typeArg) ?? "";
      const parentName = coerceString(parentArg) ?? "";

      const existing = story.state.variablesState.GetVariableWithName(
        typeName,
      ) as AbstractValue | null;
      let typeTable: ObjectValue;
      if (existing instanceof ObjectValue) {
        typeTable = resolveParentType(story, typeName, existing);
      } else {
        typeTable = new ObjectValue(new Map<string, AbstractValue>());
        const tmt = new Map<string, AbstractValue>();
        tmt.set(DEFINE_MARKER, new StringValue(typeName));
        typeTable.metatable = new ObjectValue(tmt);
        story.state.variablesState.SetGlobal(typeName, typeTable);
      }

      const mt = new Map<string, AbstractValue>();
      mt.set(DEFINE_MARKER, new StringValue(name));
      mt.set(DEFINE_PARENT_MARKER, new StringValue(typeName));
      mt.set("__index", typeTable);
      const written = writtenIn(story);
      written(table);
      table.metatable = new ObjectValue(mt);

      if (parentName) {
        const member = typeTable.value!.get(parentName) ?? null;
        if (isDefineTable(member) && member !== table) {
          linkStructuralParent(table, member, written);
        } else {
          let waiting = pendingStructuralParents.get(typeTable);
          if (!waiting) {
            waiting = new Map();
            pendingStructuralParents.set(typeTable, waiting);
          }
          const children = waiting.get(parentName) ?? [];
          children.push(table);
          waiting.set(parentName, children);
        }
      }
      copyStructuralStoreDefaults(table, written);

      for (const level of defineChain(typeTable)) {
        written(level);
        level.value!.set(name, table);
      }
      linkWaitingStructuralChildren(typeTable, name, table, written);
      return table;
    },
  },
  "__adjust_iter": {
    arity: 3,
    fn: (story, [fRaw, s, c]) => {
      let f = fRaw;
      if (f instanceof MultiValue) f = f.values[0] ?? new NullValue();
      if (f instanceof Void) {
        f = new NullValue();
      }
      const map =
        f != null && typeof f === "object" && "value" in f
          ? (f as any).value
          : null;
      if (map instanceof Map) {
        const mt = (f as { metatable?: any }).metatable;
        const mtMap =
          mt != null && typeof mt === "object" ? mt.value : null;
        if (mtMap instanceof Map) {
          const iterFn = mtMap.get("__iter");
          if (iterFn != null && !(iterFn instanceof NullValue)) {
            let results = (story.CallLuauFunction(iterFn, [f]) ??
              []) as unknown[];
            if (results.length === 1 && results[0] instanceof MultiValue) {
              results = (results[0] as MultiValue).values;
            }
            let r0 = results[0] ?? new NullValue();
            if (r0 instanceof Void) {
              r0 = new NullValue();
            }
            return [
              r0,
              results[1] ?? new NullValue(),
              results[2] ?? new NullValue(),
            ];
          }
        }
        if (
          map instanceof Map &&
          !map.has("__closure_fn") &&
          !map.has("__stdlib_fn") &&
          !map.has(BUILTIN_ITER_TAG) &&
          !(mtMap instanceof Map && mtMap.has("__call"))
        ) {
          return [
            makeBuiltinIterator("pairs", f as ObjectValue),
            f as ObjectValue,
            new NullValue(),
          ];
        }
        return [f, s, c];
      }
      const t = luauTypeOf(f);
      if (t !== "function" && t !== "nil") {
        story.Error(`attempt to iterate over a ${t} value`);
      }
      return [f, s, c];
    },
  },

  pairs: {
    arity: 1,
    fn: (story, [t]) => {
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("pairs: argument must be a table");
        return new NullValue();
      }
      return [
        makeBuiltinIterator("pairs", t as ObjectValue),
        t as ObjectValue,
        new NullValue(),
      ];
    },
  },
  ipairs: {
    arity: 1,
    fn: (story, [t]) => {
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("ipairs: argument must be a table");
        return new NullValue();
      }
      return [
        makeBuiltinIterator("ipairs", t as ObjectValue),
        t as ObjectValue,
        new IntValue(0),
      ];
    },
  },
  instances: {
    arity: 1,
    fn: (story, [t]) => {
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("instances: argument must be a `define`d type");
        return new NullValue();
      }
      return [
        makeBuiltinIterator("instances", t as ObjectValue),
        t as ObjectValue,
        new NullValue(),
      ];
    },
  },
  iinstances: {
    arity: 1,
    fn: (story, [t]) => {
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("iinstances: argument must be a `define`d type");
        return new NullValue();
      }
      return [
        makeBuiltinIterator("iinstances", t as ObjectValue),
        t as ObjectValue,
        new IntValue(0),
      ];
    },
  },
  props: {
    arity: 1,
    fn: (story, [x]) => {
      if (!(x instanceof ObjectValue)) {
        story.Error("props: argument must be a table");
        return new NullValue();
      }
      const flat = new Map<string, AbstractValue>();
      const shadowed = new Set<string>();
      let cur: ObjectValue | null = x;
      let guard = 0;
      while (cur instanceof ObjectValue && guard++ < 64) {
        for (const [k, v] of cur.value as Map<string, AbstractValue>) {
          if (k.startsWith("__")) continue;
          if (flat.has(k) || shadowed.has(k)) continue;
          if (luauTypeOf(v) === "function") {
            shadowed.add(k);
            continue;
          }
          flat.set(k, v);
        }
        const idx: AbstractValue | null =
      metatableMap(cur)?.get("__index") ?? null;
        cur = idx instanceof ObjectValue ? idx : null;
      }
      const flatTable = new ObjectValue(flat);
      return [
        makeBuiltinIterator("pairs", flatTable),
        flatTable,
        new NullValue(),
      ];
    },
  },

  "os.clock": {
    arity: 0,
    fn: () => {
      ambientReads.count += 1;
      return typeof performance !== "undefined" && performance.now
        ? performance.now() / 1000
        : Date.now() / 1000;
    },
  },
  "os.time": {
    arity: -1,
    fn: (story, args) => {
      if (args.length === 0 || args[0] == null || args[0] instanceof NullValue) {
        ambientReads.count += 1;
        return Math.floor(Date.now() / 1000);
      }
      const t = args[0];
      const map =
        t != null && typeof t === "object" && "value" in t
          ? (t as any).value
          : null;
      if (!(map instanceof Map)) {
        story.Error("os.time: argument must be a table");
        return 0;
      }
      const field = (k: string): number | null => {
        const v = map.get(k);
        if (v == null || v instanceof NullValue) return null;
        const n = coerceNumber(v);
        return n == null ? null : Math.trunc(n);
      };
      const requireField = (k: string): number | null => {
        const v = field(k);
        if (v === null) {
          story.Error(`os.time: field '${k}' missing in date table`);
          return null;
        }
        return v;
      };
      const year = requireField("year");
      if (year === null) return 0;
      const month = requireField("month");
      if (month === null) return 0;
      const day = requireField("day");
      if (day === null) return 0;
      const hour = field("hour") ?? 12;
      const min = field("min") ?? 0;
      const sec = field("sec") ?? 0;
      const ms = Date.UTC(year, month - 1, day, hour, min, sec);
      if (!Number.isFinite(ms) || ms < 0) return null;
      return Math.floor(ms / 1000);
    },
  },
  "os.difftime": { arity: 2, pure: true, fn: (_, [t2, t1]) => t2 - t1 },

  "os.date": {
    arity: -1,
    fn: (story, args) => {
      let fmt =
        args.length > 0 && args[0] != null
          ? (coerceString(args[0]) ?? "%c")
          : "%c";
      const timeArg =
        args.length > 1 && args[1] != null && !(args[1] instanceof NullValue)
          ? coerceNumber(args[1])
          : null;
      if (timeArg != null && timeArg < 0) return null;
      if (timeArg == null) {
        ambientReads.count += 1;
      }
      const epochMs = timeArg != null ? Math.trunc(timeArg) * 1000 : Date.now();
      let utc = false;
      if (fmt.startsWith("!")) {
        utc = true;
        fmt = fmt.slice(1);
      }
      const d = new Date(epochMs);
      const fields = utc ? getDateFieldsUTC(d) : getDateFieldsLocal(d);
      if (fmt === "*t") {
        const map = new Map<string, AbstractValue>();
        map.set("year", new IntValue(fields.year));
        map.set("month", new IntValue(fields.month));
        map.set("day", new IntValue(fields.day));
        map.set("hour", new IntValue(fields.hour));
        map.set("min", new IntValue(fields.min));
        map.set("sec", new IntValue(fields.sec));
        map.set("wday", new IntValue(fields.wday));
        map.set("yday", new IntValue(fields.yday));
        map.set("isdst", new BoolValue(fields.isdst));
        return new ObjectValue(map);
      }
      return formatDateString(fmt, fields, story);
    },
  },

  "utf8.char": {
    arity: -1,
    fn: (story, args) => {
      let out = "";
      for (const v of args) {
        const n = coerceNumber(v);
        if (n === null) {
          story.Error("utf8.char: number expected");
          return "";
        }
        const cp = Math.trunc(n);
        if (!(cp >= 0 && cp <= 0x10ffff)) {
          story.Error("utf8.char: value out of range");
          return "";
        }
        if (cp < 0x80) out += String.fromCharCode(cp);
        else if (cp <= 0x7ff) {
          out += String.fromCharCode(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
        } else if (cp <= 0xffff) {
          out += String.fromCharCode(
            0xe0 | (cp >> 12),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f),
          );
        } else {
          out += String.fromCharCode(
            0xf0 | (cp >> 18),
            0x80 | ((cp >> 12) & 0x3f),
            0x80 | ((cp >> 6) & 0x3f),
            0x80 | (cp & 0x3f),
          );
        }
      }
      return out;
    },
  },
  "utf8.codepoint": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      const s = coerceString(args[0]) ?? "";
      const bytes = luauStringToBytes(s);
      const len = bytes.length;
      const iArg =
        args.length > 1 && !(args[1] instanceof NullValue)
          ? (coerceNumber(args[1]) ?? 1)
          : 1;
      const posi = utf8PosRelat(Math.trunc(iArg), len);
      const jArg =
        args.length > 2 && !(args[2] instanceof NullValue)
          ? (coerceNumber(args[2]) ?? posi)
          : posi;
      const pose = utf8PosRelat(Math.trunc(jArg), len);
      if (posi < 1) {
        story.Error("utf8.codepoint: out of range");
        return [];
      }
      if (pose > len) {
        story.Error("utf8.codepoint: out of range");
        return [];
      }
      if (posi > pose) return [];
      const codepoints: number[] = [];
      let k = posi - 1;
      while (k < pose) {
        const d = utf8DecodeBytes(bytes, k);
        if (d === null) {
          story.Error("utf8.codepoint: invalid UTF-8 code");
          return [];
        }
        codepoints.push(d.code);
        k = d.next;
      }
      return codepoints;
    },
  },
  "utf8.len": {
    arity: -1,
    minArgs: 1,
    fn: (story, args) => {
      const s = coerceString(args[0]) ?? "";
      const bytes = luauStringToBytes(s);
      const len = bytes.length;
      const iArg =
        args.length > 1 && !(args[1] instanceof NullValue)
          ? (coerceNumber(args[1]) ?? 1)
          : 1;
      const jArg =
        args.length > 2 && !(args[2] instanceof NullValue)
          ? (coerceNumber(args[2]) ?? -1)
          : -1;
      let posi = utf8PosRelat(Math.trunc(iArg), len);
      let posj = utf8PosRelat(Math.trunc(jArg), len);
      if (!(1 <= posi && posi - 1 <= len)) {
        story.Error("utf8.len: initial position out of string");
        return null;
      }
      posi--;
      posj--;
      if (!(posj < len)) {
        story.Error("utf8.len: final position out of string");
        return null;
      }
      let n = 0;
      while (posi <= posj) {
        const d = utf8DecodeBytes(bytes, posi);
        if (d === null) {
          return new MultiValue([new NullValue(), new IntValue(posi + 1)]);
        }
        posi = d.next;
        n++;
      }
      return n;
    },
  },
  "utf8.offset": {
    arity: -1,
    minArgs: 2,
    fn: (story, args) => {
      const s = coerceString(args[0]) ?? "";
      const nArg = coerceNumber(args[1]);
      if (nArg === null) {
        story.Error("utf8.offset: number expected");
        return null;
      }
      let n = Math.trunc(nArg);
      const bytes = luauStringToBytes(s);
      const len = bytes.length;
      const defaultI = n >= 0 ? 1 : len + 1;
      const iArg =
        args.length > 2 && !(args[2] instanceof NullValue)
          ? (coerceNumber(args[2]) ?? defaultI)
          : defaultI;
      let posi = utf8PosRelat(Math.trunc(iArg), len);
      if (!(1 <= posi && posi - 1 <= len)) {
        story.Error("utf8.offset: position out of range");
        return null;
      }
      posi--;
      if (n === 0) {
        while (posi > 0 && utf8IsCont(bytes, posi)) posi--;
      } else {
        if (utf8IsCont(bytes, posi)) {
          story.Error("utf8.offset: initial position is a continuation byte");
          return null;
        }
        if (n < 0) {
          while (n < 0 && posi > 0) {
            do {
              posi--;
            } while (posi > 0 && utf8IsCont(bytes, posi));
            n++;
          }
        } else {
          n--;
          while (n > 0 && posi < len) {
            do {
              posi++;
            } while (utf8IsCont(bytes, posi));
            n--;
          }
        }
      }
      if (n === 0) return posi + 1;
      return null;
    },
  },
  "utf8.codes": {
    arity: 1,
    fn: (_, [sArg]) => {
      const input = coerceString(sArg) ?? "";
      const stateMap = new Map<string, AbstractValue>();
      stateMap.set(UTF8CODES_INPUT, new StringValue(input));
      const iterMap = new Map<string, AbstractValue>();
      iterMap.set(BUILTIN_ITER_TAG, new StringValue("utf8codes"));
      iterMap.set(BUILTIN_ITER_STATE, new ObjectValue(stateMap));
      iterMap.set(BUILTIN_ITER_CURSOR, new IntValue(0));
      return new ObjectValue(iterMap);
    },
  },
  "utf8.nfcnormalize": {
    arity: 1,
    fn: (_, [s]) => (coerceString(s) ?? "").normalize("NFC"),
  },
  "utf8.nfdnormalize": {
    arity: 1,
    fn: (_, [s]) => (coerceString(s) ?? "").normalize("NFD"),
  },

  "debug.traceback": {
    arity: -1,
    fn: (story, args) => {
      const msg = args.length > 0 ? coerceString(args[0]) : null;
      const trace = story.CallStackTrace();
      const header = msg != null && msg !== "" ? msg + "\nstack traceback:\n" : "stack traceback:\n";
      return header + trace;
    },
  },
  "debug.info": {
    arity: 2,
    fn: (story, [levelArg, optsArg]) => {
      const level = Math.floor(coerceNumber(levelArg) ?? 1);
      const opts = coerceString(optsArg) ?? "";
      const frames = story.CallFrameCount();
      const idx = frames - level;
      if (idx < 0 || idx >= frames) return new NullValue();
      const pathStr = story.CallFramePath(idx) ?? "?";
      const name = story.CallFrameName(idx) ?? "?";
      const results: AbstractValue[] = [];
      for (const c of opts) {
        switch (c) {
          case "s":
            results.push(new StringValue(pathStr));
            break;
          case "l":
            results.push(new IntValue(-1));
            break;
          case "n":
            results.push(new StringValue(name));
            break;
          case "a":
            results.push(new IntValue(0));
            break;
          case "f":
            results.push(new NullValue());
            break;
          case "r":
            results.push(new IntValue(-1));
            results.push(new IntValue(-1));
            break;
          default:
            story.Error(`debug.info: unknown option character "${c}"`);
            return new NullValue();
        }
      }
      return results.length === 0
        ? new NullValue()
        : results.length === 1
          ? results[0]!
          : new MultiValue(results);
    },
  },

  assert: {
    arity: -1,
    fn: (story, args) => {
      const raise = (raw: string) => {
        const message = story.errorMessageFormatter
          ? story.errorMessageFormatter(story, raw)
          : raw;
        story.Error(message);
      };
      if (args.length === 0) {
        raise("missing argument #1");
        return [];
      }
      if (!isTruthy(args[0])) {
        raise(coerceString(args[1]) ?? "assertion failed!");
        return [];
      }
      return args;
    },
  },
};

export const INK_BUILTIN_ALIASES: Record<
  string,
  Record<string, InkBuiltinAlias>
> = {
  count: {
    turns: (argCount) => (argCount === 1 ? "TURNS_SINCE" : null),
    visits: "READ_COUNT",
    visited: "READ_COUNT",
  },
};

export function lookupStdLibBuiltin(
  receiverName: string,
  methodName: string,
  argCount: number,
): string | null {
  const aliases = Object.hasOwn(INK_BUILTIN_ALIASES, receiverName)
    ? INK_BUILTIN_ALIASES[receiverName]
    : undefined;
  const alias = aliases && Object.hasOwn(aliases, methodName)
    ? aliases[methodName]
    : undefined;
  if (alias != null) {
    const resolved = typeof alias === "string" ? alias : alias(argCount);
    if (resolved !== null) return resolved;
  }
  const fullName = `${receiverName}.${methodName}`;
  if (lookupAnyStdLib(fullName) != null) {
    return fullName;
  }
  return null;
}

export function lookupGlobalStdLibBuiltin(
  name: string,
  _argCount: number,
): string | null {
  return lookupAnyStdLib(name) != null ? name : null;
}

export const STDLIB_CONSTANTS: Record<string, number | string | boolean> = {
  "math.pi": Math.PI,
  "math.huge": Infinity,
  "math.tau": Math.PI * 2,
  "math.sqrt2": Math.SQRT2,
  "math.e": Math.E,
  "math.phi": (1 + Math.sqrt(5)) / 2,
  "math.nan": NaN,

  "utf8.charpattern": "[\0-\x7F\xC2-\xF4][\x80-\xBF]*",

  _VERSION: "Luau",
};

export function lookupStdLibConstant(
  name: string,
): number | string | boolean | undefined {
  return Object.hasOwn(STDLIB_CONSTANTS, name) ? STDLIB_CONSTANTS[name] : undefined;
}

export function lookupStateAwareStdLib(name: string): StdLibEntry | null {
  const entry = lookupAnyStdLib(name);
  if (entry == null || entry.pure) return null;
  return entry;
}

export function isStdLibFunctionName(name: string): boolean {
  return lookupAnyStdLib(name) != null;
}

const STDLIB_NAMESPACES: Set<string> = (() => {
  const out = new Set<string>();
  for (const key of Object.keys(STDLIB)) {
    const dot = key.indexOf(".");
    if (dot > 0) out.add(key.slice(0, dot));
  }
  return out;
})();
export function isStdLibNamespaceName(name: string): boolean {
  return STDLIB_NAMESPACES.has(name);
}

export function stdLibRequiredArgs(entry: StdLibEntry): number {
  return entry.arity >= 0 ? entry.arity : (entry.minArgs ?? 0);
}

export function firstMissingStdLibArg(
  entry: StdLibEntry,
  args: readonly unknown[],
): number {
  if (entry.validatesArgs) return 0;
  const required = stdLibRequiredArgs(entry);
  for (let i = 0; i < required; i++) {
    const v = args[i];
    if (
      v === undefined ||
      v instanceof Void ||
      (v instanceof MultiValue && v.values.length === 0)
    ) {
      return i + 1;
    }
  }
  return 0;
}

export function isPureNumberStdLibOp(name: string): boolean {
  const entry = lookupAnyStdLib(name);
  if (!entry) return false;
  const types = pureStdLibTypes(entry);
  return !!types && types.length === 1 && types[0] === "number";
}

export function lookupAnyStdLib(name: string): StdLibEntry | null {
  return Object.hasOwn(STDLIB, name) ? STDLIB[name] ?? null : null;
}

export function pureStdLibTypes(entry: StdLibEntry): PureStdLibType[] | null {
  if (entry.pure === true) return ["number"];
  if (Array.isArray(entry.pure) && entry.pure.length > 0) return entry.pure;
  return null;
}

export function unwrapArgsForPureStdLibFn(
  entry: StdLibEntry,
  args: any[],
  story?: any,
  name?: string,
): any[] {
  const types = pureStdLibTypes(entry);
  if (!types) return args;
  const numeric = types.length === 1 && types[0] === "number";
  const shortName =
    name != null && name.includes(".")
      ? name.slice(name.lastIndexOf(".") + 1)
      : name;
  return args.map((v, i) => {
    if (v != null && typeof v === "object" && "value" in v) {
      const raw = (v as { value: unknown }).value;
      if (numeric) {
        if (typeof raw === "number") return raw;
        if (typeof raw === "string") {
          const n = parseLuauNumber(raw);
          if (n !== null) return n;
        }
        if (story && shortName) {
          story.Error(
            `invalid argument #${i + 1} to '${shortName}' (number expected, got ${luauTypeOf(v)})`,
          );
        }
      }
      return raw;
    }
    return v;
  });
}

export function lookupStdLibDeprecation(name: string): string | null {
  const entry = lookupAnyStdLib(name);
  return entry?.deprecated ?? null;
}

export function getPureStdLibEntries(): Array<
  [string, StdLibEntry, PureStdLibType[]]
> {
  const result: Array<[string, StdLibEntry, PureStdLibType[]]> = [];
  for (const [name, entry] of Object.entries(STDLIB)) {
    const types = pureStdLibTypes(entry);
    if (types) result.push([name, entry, types]);
  }
  return result;
}
