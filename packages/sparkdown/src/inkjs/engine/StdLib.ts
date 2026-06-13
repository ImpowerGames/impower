import { getPluralCategory } from "./PluralRules";
import { StoryException } from "./StoryException";
import { PRNG } from "./PRNG";
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
  Value,
} from "./Value";
import {
  luaPatternToJs,
  executeLuaPattern,
  LuaPatternError,
  type CompiledLuaPattern,
  type PatternMatchResult,
} from "./LuaPatterns";

// Sparkdown's Luau-standard-library bridge. Three tables drive everything:
//
//   - `STDLIB` — the unified registry of every Luau stdlib function,
//     keyed by dotted full name (`"math.abs"`, `"plural.category"`,
//     `"assert"`, ...). Each entry carries `{arity, pure?, fn}`. Pure
//     entries (`pure: true`) are auto-registered with
//     `NativeFunctionCall` at engine init and benefit from the
//     type-coercion fast path; state-aware entries route through the
//     generic `RunStdLibFunction` ControlCommand dispatcher in
//     Story.ts. Adding a new function — pure or state-aware — is one
//     entry here.
//
//   - `INK_BUILTIN_ALIASES` — legacy per-function ControlCommand
//     bindings that still need compile-time setup the generic
//     dispatcher can't do (currently `count.turns(-> t)` →
//     `TURNS_SINCE` and `count.visits(-> t)` → `READ_COUNT`, which
//     mark the target container for visit-counting in
//     `FunctionCall.ResolveReferences`). Migration goal: shrink this
//     table to empty.
//
//   - `METHOD_DISPATCH` (in `MethodDispatch.ts`) — builtin method-call
//     receivers for `obj:method(args)`. The lowerer prefixes method
//     names with `__method_` and emits a normal `FunctionCall`;
//     `NativeFunctionCall.Call` recognizes the prefix and routes through
//     `callBuiltinMethod`. These are *variadic* (`numberOfParameters` is
//     `VARIADIC_ARITY` = -1) and bypass the operator-style type coercion
//     in favor of receiver-type branching inside each impl.
//
// `STDLIB` + `INK_BUILTIN_ALIASES` feed `lookupStdLibBuiltin` — the
// compiler's call-site mapper checks both. `METHOD_DISPATCH` feeds the
// lowerer's separate method-name check.

export type NumericUnary = (v: number) => number;
export type NumericBinary = (a: number, b: number) => number;
export type StdLibFn = NumericUnary | NumericBinary;

// State-aware stdlib function. Takes the running `story` (typed as
// `any` here to avoid a circular import with `Story.ts`) and an
// array of popped eval-stack values, and may push a return value
// back onto the stack. Used for global Luau builtins that need
// access to runtime state — `assert` calls `story.AddError`,
// `plural.category` reads `lang.current` from `state.variablesState`,
// etc. — and therefore need `pure: false` (the default) so the
// generic dispatcher passes them the `story` reference.
export type StateAwareStdLibFn = (story: any, args: any[]) => any | undefined;

/**
 * Operand types that a `pure` stdlib entry can be registered for in
 * `NativeFunctionCall`. Names match Lua's `type()` return values
 * (`"number"`, `"string"`, ...) — `"number"` covers both Int and
 * Float `ValueType`s under the hood, hiding the JS-side numeric split
 * the way Lua does.
 */
export type PureStdLibType = "number" | "string";

export interface StdLibEntry {
  /** Number of stack values to pop before calling `fn`. */
  arity: number;
  /**
   * Pure entries ignore the `story` arg, take + return raw JS values,
   * and get auto-registered with `NativeFunctionCall` at engine init
   * — preserving the type-coercion fast path. Non-pure entries
   * (`pure` omitted / false) route through the generic
   * `RunStdLibFunction` dispatcher in Story.ts.
   *
   * - `pure: true` is shorthand for `pure: ["number"]` (the classic
   *   numeric fast path used by `math.*`).
   * - `pure: ["string"]` registers a String-typed op (used by
   *   substring predicates like `string.contains`).
   * - `pure: ["number", "string"]` registers both.
   *
   * The dispatch decision happens in `FunctionCall.GenerateIntoContainer`:
   * pure entries fall through to the existing `NativeFunctionCall`
   * branch (because they're registered there); non-pure entries match
   * `isStateAwareStdLib` and emit `RunStdLibFunction`.
   */
  pure?: boolean | PureStdLibType[];
  /**
   * Marks the entry as deprecated in upstream Luau. The runtime
   * still dispatches the call (we keep deprecated entries for source
   * compatibility with imported Luau code), but the lowerer emits an
   * Information-severity LSP diagnostic tagged
   * `DiagnosticTag.Deprecated` (= 2) at the call site, which editors
   * render struck-through. The string is the diagnostic message —
   * include the suggested replacement so the author can see the fix
   * inline.
   */
  deprecated?: string;
  /**
   * The entry's `fn` performs its own argument validation with
   * Luau-exact messages (e.g. `requireTableArg`'s `missing argument
   * #1 to 'clear' (table expected)`). First-class dispatch
   * (`tryInvokeStdLibMarkerValue` in Story.ts) skips its generic
   * under-application pre-raise for these entries so the richer
   * message wins; entries WITHOUT this flag get the generic
   * `missing argument #N to 'name'` raise (Lua's `luaL_checkany`
   * contract — `pcall(rawequal, "a")` must trap, not compare
   * against nil).
   */
  validatesArgs?: boolean;
  /**
   * Implementation. Receives popped args in source order (arg 0 first,
   * arg 1 second, …) — the runtime handler reverses the pop order so
   * implementations don't have to think about stack direction. For
   * pure entries, `story` is `null`. May return a value to push back
   * onto the eval stack, or `undefined` for void/no-return semantics.
   */
  fn: StateAwareStdLibFn;
}

// Backwards-compat alias — every consumer was migrated already; this
// is just an export rename guard for future refactors.
export type StateAwareStdLibEntry = StdLibEntry;

// Sentinel for native functions whose arity can't be statically checked
// (currently: the `__method_*` builtin-method family, which validates
// arity inside each implementation). FunctionCall.GenerateIntoContainer
// and NativeFunctionCall.Call both skip arity assertions when they see
// this value.
export const VARIADIC_ARITY = -1;

// ============================================================================
// Type coercion helpers for stdlib fns
// ============================================================================
//
// State-aware stdlib `fn`s receive popped eval-stack values, which are
// `InkObject` instances (`IntValue`, `FloatValue`, `StringValue`, etc.)
// wrapping JS primitives. Importing the concrete Value classes here
// would force a circular dependency (Value.ts imports… eventually
// circles back). So we duck-type on the `.value` field, which every
// Value subclass exposes.
//
// All helpers return `null` when the value can't be coerced — callers
// decide whether to raise an error or substitute a default.

/** Pull a JS number out of an `IntValue` / `FloatValue`, or accept raw. */
export function coerceNumber(v: any): number | null {
  if (typeof v === "number") return v;
  if (typeof v === "string") return parseLuauNumber(v);
  if (v != null && typeof v === "object" && "value" in v) {
    const raw = (v as any).value;
    if (typeof raw === "number") return raw;
    // Lua's tonumber coercion: numeric STRINGS convert wherever a
    // number is expected (`math.frexp("1.5")` — math.luau line 489).
    if (typeof raw === "string") return parseLuauNumber(raw);
  }
  return null;
}

/**
 * Format a JS number the way Lua's `tostring` does for the special
 * values: `nan` (not "NaN"), `inf` / `-inf` (not "Infinity"), and
 * `-0` (JS `String(-0)` drops the sign). Ordinary numbers use JS
 * String() formatting, which matches Lua's %.14g closely enough for
 * the conformance surface.
 */
export function luauNumberToString(n: number): string {
  if (Number.isNaN(n)) return "nan";
  if (n === Infinity) return "inf";
  if (n === -Infinity) return "-inf";
  if (Object.is(n, -0)) return "-0";
  return String(n);
}

/**
 * Parse a string as a Lua number, returning null when the text isn't
 * a valid Lua numeral. Accepts decimal / scientific / hex (`0xff`)
 * forms plus Luau's `nan` / `inf` / `-inf` spellings, with
 * surrounding whitespace tolerated. Shared by `tonumber` and the
 * arithmetic string-coercion path (`1 + "2"`, `2 * "0xa"`).
 */
// Lua 5.2 bit-field range validation for `bit32.extract` /
// `bit32.replace` — raises trappable StoryExceptions with Lua's
// message shapes (bitwise.luau lines 166-169 pcall these).
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

// Lua 5.2 bit32 shifts: negative counts shift the other direction,
// counts >= 32 produce 0. (JS `<<`/`>>>` wrap the count mod 32.)
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
  // JS Number() already parses 0x hex, decimal, and scientific
  // notation; it returns NaN for anything else (and we've handled
  // the literal "nan" spelling above, so NaN here means invalid).
  const n = Number(t);
  return Number.isNaN(n) ? null : n;
}

// 64-bit unsigned reinterpretation for `%o %u %x %X` — Luau casts the
// double through (long long) when negative, so `%x` of -1 is
// ffffffffffffffff, not 32-bit ffffffff.
function toUint64(n: number): bigint {
  if (!Number.isFinite(n)) return 0n;
  return BigInt.asUintN(64, BigInt(Math.trunc(n)));
}

// Stable per-object identity tokens for Lua's opaque `table: 0x...` /
// `function: 0x...` tostring forms. WeakMap so tables stay collectable.
const pointerIdRegistry = new WeakMap<object, number>();
let nextPointerId = 1;
function luauPointerId(o: object): string {
  let id = pointerIdRegistry.get(o);
  if (id == null) {
    id = nextPointerId++;
    pointerIdRegistry.set(o, id);
  }
  return "0x" + id.toString(16).padStart(8, "0");
}

/**
 * Pull a JS string out of a `StringValue`, or accept raw. Numbers
 * coerce to their Lua string form — `luaL_checklstring` semantics,
 * so `string.len(123) == 3` and `string.rep(12, 2) == "1212"`.
 * Booleans / tables / nil do NOT coerce.
 */
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

/**
 * Lua C-function argument contract: raise "missing argument #N to
 * 'name'" (via `story.Error` — throws, so pcall traps it) when the
 * argument slot is genuinely ABSENT: `undefined` (call site supplied
 * fewer args), a `Void` sentinel (callee returned no values), or an
 * empty multi-return. An explicit `nil` is NOT missing — entries that
 * reject nil do so with their own "invalid argument" checks.
 */
function requireStdLibArg(
  story: any,
  v: any,
  index: number,
  name: string,
): void {
  const missing =
    v === undefined ||
    v?.constructor?.name === "Void" ||
    (v instanceof MultiValue && v.values.length === 0);
  if (missing) {
    story.Error(`missing argument #${index} to '${name}'`);
  }
}

/**
 * Luau `luaL_checktable`-style validation. Raises Luau's exact
 * messages: `missing argument #N to 'name' (table expected)` when
 * the slot is absent, `invalid argument #N to 'name' (table
 * expected, got X)` when present but not a table. `name` is the
 * SHORT name (`'clear'`, not `'table.clear'`) — Luau errors use the
 * C function's own name without the library prefix. Returns the
 * unwrapped ObjectValue on success.
 */
function requireTableArg(
  story: any,
  v: any,
  index: number,
  name: string,
): ObjectValue {
  const missing =
    v === undefined ||
    v?.constructor?.name === "Void" ||
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

/**
 * Lua/Luau `type(v)` semantics: returns one of `"nil"`, `"number"`,
 * `"string"`, `"boolean"`, `"table"`, `"function"`, `"userdata"`.
 * Approximated for sparkdown's runtime by inspecting the wrapped
 * `.value` field. Used by both `type` and `typeof` registry entries.
 */
export function luauTypeOf(v: any): string {
  if (v == null) return "nil";
  if (typeof v === "object" && "value" in v) {
    // Callable values get reported as "function" before the generic
    // object-as-table fallback below. Closure-shaped ObjectValues
    // (anonymous fn with upvalues) carry a `__closure_fn` key in
    // their .value Map; DivertTargetValue (bare knot reference, no
    // upvalues) and VariablePointerValue (function held by a local)
    // are detected via constructor name to avoid the import cycle
    // these runtime files have with Value.ts.
    const ctorName = v?.constructor?.name;
    if (
      ctorName === "DivertTargetValue" ||
      ctorName === "VariablePointerValue"
    ) {
      return "function";
    }
    const raw = (v as any).value;
    if (raw == null) return "nil";
    if (typeof raw === "number") return "number";
    if (typeof raw === "string") return "string";
    if (typeof raw === "boolean") return "boolean";
    if (raw instanceof Map) {
      if (raw.has("__closure_fn")) return "function";
      // Stdlib-fn sentinel: when a bare stdlib name (`type`, `assert`,
      // `print`, ...) is referenced as a value (not called), the
      // runtime falls back to an ObjectValue carrying this marker so
      // `type(type)` / `type(assert)` correctly report "function"
      // (rather than "table" or "nil").
      if (raw.has("__stdlib_fn")) return "function";
      // `newproxy` sentinel — userdata-like values report "userdata".
      // Intentionally NOT spoofable via a `__type` metatable field
      // (matching Luau's anti-spoofing rule).
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

/**
 * LUA truthiness check over JS-level or wrapped values. Returns
 * `false` only for: `nil`/`null`/`undefined`, `false`, `Void`
 * instances (function returned nothing → nil), and any wrapped Value
 * whose `.value` is null or `false`. Everything else — including `0`
 * and `""` — is truthy, matching Luau. Used by `assert`,
 * `string.find`'s plain flag, `table.sort` comparator results,
 * `newproxy`, etc. — all sites where Lua semantics apply.
 *
 * (Formerly treated 0 / "" as falsy — an ink-style divergence that
 * broke basic.luau's truthiness section. The engine-value equivalent
 * for runtime control flow is `isLuauTruthy` in LuauTruthiness.ts.)
 */
export function isTruthy(v: any): boolean {
  if (v == null) return false;
  if (v === false) return false;
  if (typeof v === "object" && "value" in v) {
    const raw = (v as any).value;
    if (raw == null || raw === false) return false;
  }
  // Void from the runtime engine is treated as falsy (function returned
  // nothing). Duck-typed via the constructor name to avoid the import.
  if (
    typeof v === "object" &&
    v != null &&
    v.constructor &&
    v.constructor.name === "Void"
  ) {
    return false;
  }
  return true;
}

/**
 * Translate Lua's 1-indexed `init` arg (used by `string.find` /
 * `string.match` / `string.gmatch`) to a 1-based start position.
 * Negative values count from the end of the string; out-of-range
 * values are clamped to [1, length+1]. Returns 1 when `init` is
 * absent or null.
 */
export function resolveInit(arg: any, strLen: number): number {
  const n = coerceNumber(arg);
  if (n == null) return 1;
  let i = Math.floor(n);
  if (i < 0) i = Math.max(strLen + i + 1, 1);
  else if (i === 0) i = 1;
  if (i > strLen + 1) i = strLen + 1;
  return i;
}

// ============================================================
// `string.pack` / `string.unpack` / `string.packsize` — binary
// packing, ported from Luau's lstrlib.cpp (itself Lua 5.3's
// implementation with Luau-specific type sizes):
//
//   < > =        endianness (`=`/default = native = little)
//   ![N]         set max alignment to N, 1..16 (bare `!` = 8);
//                items pad to min(item size, maxalign) boundaries
//   b B          1-byte signed / unsigned int
//   h H          2-byte signed / unsigned int
//   l L          8-byte signed / unsigned int (long long)
//   j J T        4-byte int (Luau's lua_Integer / size_t are 32-bit)
//   i[N] I[N]    N-byte (1..16) signed / unsigned int (default 4)
//   f            float (4 bytes)
//   d n          double / lua_Number (8 bytes)
//   s[N]         string with N-byte length prefix (default 4)
//   z            null-terminated string
//   cN           fixed-size N-byte string (never aligned)
//   x            exactly one zero padding byte
//   Xop          align-only: pad to `op`'s alignment, pack nothing;
//                `op` is consumed and contributes no data
//   (space)      ignored
//
// Integer sizes run up to MAXINTSIZE (16). Values are carried as
// 64-bit two's complement (BigInt) with sign/zero fill beyond 8
// bytes, matching packint/unpackint — including unpack's
// "%d-byte integer does not fit into Lua Integer" check that the
// extra bytes are pure sign extension.
//
// Strings are encoded as JS strings where each character is a byte
// value in [0, 255]. This matches the convention used by
// `string.byte` / `string.char` already in the runtime — `string.pack`
// output round-trips through those for byte-level inspection.

const PACK_MAXINTSIZE = 16; // max bytes in a packed integer
const PACK_SZINT = 8; // sizeof(long long) — the 64-bit value window
const PACK_MAXALIGN = 8; // bare `!` alignment
const PACK_MAXSSIZE = 1 << 30; // Luau's 1GB string-size ceiling
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
  | { kind: "char"; size: number } // `cN` — never aligned
  | { kind: "string"; lenSize: number; littleEndian: boolean; align: number }
  | { kind: "zstr" } // `z`
  | { kind: "padding" } // `x` — exactly one zero byte
  | { kind: "alignpad"; align: number }; // `Xop` — alignment only, no data

// The option's data footprint in bytes (string = its length prefix;
// variable-size `z` and the no-data options are 0).
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

// Pad bytes needed to bring `pos` up to an `align` boundary
// (align is 0 or a power of 2 — validated at parse time).
function packPadCount(align: number, pos: number): number {
  if (align <= 1) return 0;
  return (align - (pos & (align - 1))) & (align - 1);
}

function parsePackFormat(fmt: string, story: any): PackItem[] | null {
  const items: PackItem[] = [];
  let i = 0;
  let littleEndian = true; // native endianness = little
  let maxAlign = 1;

  const isDigit = () => {
    const c = fmt.charCodeAt(i);
    return c >= 48 && c <= 57;
  };

  // lstrlib.cpp getnum: read a decimal numeral or return `df`.
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

  // getnumlimit: numeral bounded to [1, MAXINTSIZE].
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

  // lstrlib.cpp getoption: read and classify one option, updating
  // endianness/alignment state as a side effect.
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
      // Luau's lua_Integer and size_t are 32-bit.
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
      // `X` takes its alignment from the immediately following
      // option, which is consumed and contributes no data.
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
      if (align > maxAlign) align = maxAlign; // enforce maximum alignment
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

// packint (lstrlib.cpp): append `size` two's-complement bytes of `n`.
// The value occupies the low 8 bytes; anything beyond is sign-fill
// (0xFF when packing a negative signed value, else 0x00).
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

// unpackint (lstrlib.cpp): read a `size`-byte integer. The value
// lives in the low 8 bytes; for size > 8 every extra byte must be
// pure sign/zero extension or the value doesn't fit in 64 bits.
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
      res = (res ^ mask) - mask; // sign extension
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
    // `bytes.length` is the running totalsize — alignment pads first.
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
        // BigInt can't carry inf/nan; C's double→long long cast here
        // is UB anyway, so reject like Lua's integer-representation
        // check does.
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
  // posrelat + clamp (str_unpack): negative counts back from the
  // end; 0 and out-of-range-negative clamp to the string start.
  let rel = Math.trunc(posArg);
  if (rel < 0) rel += ld + 1;
  if (rel < 0) rel = 0;
  let pos = rel - 1; // 1-indexed → 0-indexed
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
    pos += pad; // skip alignment
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
      pos += len; // skip string body (prefix added below as `size`)
    } else if (item.kind === "zstr") {
      let end = pos;
      while (end < ld && data.charCodeAt(end) !== 0) end++;
      if (end >= ld) {
        story.Error("string.unpack: unfinished string for format 'z'");
        return null;
      }
      values.push(new StringValue(data.slice(pos, end)));
      pos = end + 1; // skip string plus final '\0'
    }
    pos += size;
  }
  return { values, nextPos: pos + 1 }; // 0-indexed → 1-indexed
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

// ============================================================
// `os.date` strftime support.
// ============================================================

interface DateFields {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  min: number; // 0-59
  sec: number; // 0-59
  wday: number; // 1-7, 1 = Sunday (matches Lua)
  yday: number; // 1-366
  isdst: boolean;
  weekdayName: string; // "Monday", "Tuesday", ...
  monthName: string; // "January", "February", ...
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
  // `month` is 1-12. Days per month (non-leap):
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
  // JS's `getTimezoneOffset` doesn't tell us DST directly. Compare
  // to January's offset (a known-non-DST month in the northern
  // hemisphere, and never-DST in the southern). Different sign →
  // DST is in effect at `d`.
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
        // `%a %b %e %H:%M:%S %Y` — typical Lua default.
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
        // Lua: 0 = Sunday … 6 = Saturday.
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
        // Timezone abbreviation. JS doesn't expose this portably;
        // emit a stable placeholder rather than guessing.
        out += "UTC";
        break;
      case "%":
        out += "%";
        break;
      case "":
        story.Error("os.date: invalid conversion specifier '%'");
        return "";
      default:
        // loslib's message — checkerr greps for the exact phrase.
        story.Error(`os.date: invalid conversion specifier '%${next}'`);
        return "";
    }
    i += 2;
  }
  return out;
}

// ============================================================
// Perlin noise (used by `math.noise`).
// ============================================================
//
// Standard Ken Perlin "improved noise" — fade(t) = 6t^5 - 15t^4 + 10t^3
// for smoother (C2-continuous) interpolation. Permutation table is a
// deterministic shuffle; values match Perlin's reference impl. The
// `PERLIN_P[i + 256] = PERLIN_P[i]` doubling avoids per-lookup
// modulo. Output is roughly in `[-1, 1]` (Perlin's gradients are
// chosen so the typical range is `[-sqrt(3)/2, sqrt(3)/2] ≈ [-0.87, 0.87]`,
// but corner cases can exceed slightly).

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

// Luau computes `math.noise` entirely in FLOAT32 (lmathlib's perlin
// is `float`-typed) — math.luau asserts BIT-EXACT doubles produced by
// that float pipeline (`math.noise(455.72..., ...) ==
// 0.5010709762573242`), so every intermediate here goes through
// Math.fround.
const fr = Math.fround;

function perlinFade(t: number): number {
  // C left-association with per-op float rounding:
  // ((t*t)*t) * ((t*(t*6-15))+10)
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

/**
 * Classify the `repl` arg to `string.gsub`. Returns:
 *   - "string"   — repl is a string/number template (expand via
 *                  `expandGsubStringRepl`).
 *   - "table"    — repl is an ObjectValue map (lookup by capture).
 *   - "error"    — repl is a function (Phase 5, deferred) or an
 *                  unsupported type; emits `story.Error` first.
 *
 * Caller checks `"error"` and bails. The function-form check looks
 * for the closure marker `__closure_fn` on the ObjectValue — see
 * `Story.ts > extractClosurePath`.
 */
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
      // Closure-wrapped user fn, or a stdlib builtin referenced
      // first-class (`gsub(s, p, string.upper)`) — both dispatch
      // through `story.CallLuauFunction`.
      return "function";
    }
    return "table";
  }
  // Anonymous functions without upvalues / bare knot names lower to
  // a DivertTargetValue (not closure-wrapped); var-pointers to
  // function-typed locals arrive as VariablePointerValue. Both route
  // through `story.CallLuauFunction`.
  const ctorName = repl?.constructor?.name;
  if (
    ctorName === "DivertTargetValue" ||
    ctorName === "VariablePointerValue"
  ) {
    return "function";
  }
  story.Error(
    "string.gsub: replacement must be a string, number, table, or function",
  );
  return "error";
}

/**
 * `t[key]` following Lua's `__index` chain, for the gsub table-form
 * replacement (pm.luau line 225: a lookup table whose values come
 * from a metatable `__index` function). Lives here rather than
 * reusing Story.ts's `indexThroughMetatable` because importing from
 * Story.ts would close a module cycle (Story already imports StdLib).
 */
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
      base = idx; // table form — continue the chain
      continue;
    }
    // Function form (closure ObjectValue / divert target / marker).
    const results = story.CallLuauFunction(idx, [base, new StringValue(key)]);
    return (results?.[0] as AbstractValue) ?? null;
  }
  return null;
}

/**
 * Expand `%0`-`%9` capture references and `%%` literal-percent in a
 * gsub replacement template against a match result. Returns the
 * expanded string, or `null` if the template is malformed (caller
 * has already raised the diagnostic via `story.Error`).
 *
 * Lua semantics for capture refs:
 *   - `%0` is the whole match.
 *   - `%N` (1..9) is the Nth capture. Referring to a non-existent
 *     capture is an error.
 *   - `%%` emits a single literal `%`.
 *   - `%` followed by anything else is an error.
 */
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
        // Lua quirk: with a capture-less pattern, `%1` refers to the
        // whole match (push_onecapture's level-0 special case).
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

/**
 * Convert a `PatternMatchResult.captures` array (raw JS values) to
 * stdlib `AbstractValue`s. String captures → `StringValue`, position
 * captures → `IntValue`, unmatched groups → `NullValue`.
 */
export function patternCapturesToValues(
  result: PatternMatchResult,
): AbstractValue[] {
  return result.captures.map((c) => {
    if (c == null) return new NullValue();
    if (typeof c === "number") return new IntValue(c);
    return new StringValue(c);
  });
}

/**
 * Lua's printf-style `string.format(fmt, ...)`. Supports the
 * conversion types `d i u o x X e E f g G c s q %`, the flags
 * `- + space 0 #`, optional width, and optional precision `.N`.
 *
 * Lua's semantics for the conversion types:
 *   `%d %i %u` — integer; precision = minimum digits (zero-padded).
 *   `%o` — octal; `#` flag prepends `0`.
 *   `%x %X` — hex (lower/upper); `#` flag prepends `0x` / `0X`.
 *   `%e %E` — scientific; precision = digits after decimal.
 *   `%f` — fixed-point; precision = digits after decimal (default 6).
 *   `%g %G` — shortest of f/e.
 *   `%c` — character from integer codepoint.
 *   `%s` — string (precision = max chars).
 *   `%q` — Lua-style quoted string (escape `"` `\\` and control chars).
 *   `%%` — literal `%`.
 *
 * Errors (non-numeric arg for numeric conversion, etc.) route
 * through `story.Error`; the function returns the partial result
 * accumulated so far so the caller still gets a string back.
 */
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
      // Luau `%*` — formats ANY value the way tostring does
      // (including `__tostring` metamethods). Takes no form.
      i++;
      if (argIdx >= args.length) {
        story.Error(`string.format: missing argument #${argIdx + 2}`);
        return out;
      }
      out += luauAnyToDisplayString(story, args[argIdx++]);
      continue;
    }
    // Format item — missing-arg raises before the form is scanned
    // (str_format checks `++arg > top` first).
    if (argIdx >= args.length) {
      story.Error(`string.format: missing argument #${argIdx + 2}`);
      return out;
    }
    // scanformat (lstrlib.cpp): flags capped at sizeof(FLAGS)-1=5,
    // width and precision at 2 digits each.
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
    const arg = args[argIdx++];
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
        // Zero-pad goes INSIDE the sign for numeric specifiers.
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

// `%*` / `luaL_addvalueany` — convert any value to its display string
// exactly like `tostring` (shares the STDLIB entry so `__tostring`
// metamethods and the opaque table/function forms stay consistent).
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
      // JS uses `e+5` / `e-5`; Lua uses `e+05` / `e-05` (2-digit exponent).
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
        // JS toFixed falls back to exponential notation at 1e21;
        // C's %f prints every digit. Doubles this large are
        // integral, so BigInt expands them exactly
        // (`%99.99f` of -1e308 must be 100+ chars).
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
        // C `%g` rule: exponential when the (rounded) decimal exponent
        // X satisfies X < -4 or X >= precision, else fixed with
        // `p - 1 - X` fraction digits; trailing zeros (and a bare
        // trailing point) are stripped in both styles. Note this
        // differs from JS `toPrecision`, which switches to scientific
        // at X < -7 — `%g` of 1e-5 must be "1e-05", not "0.00001".
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
      // addquoted (lstrlib.cpp): `"` `\` and newline get a backslash
      // (newline stays a LITERAL newline after it), `\r` → "\r",
      // NUL → "\000", everything else verbatim.
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

/**
 * Shared implementation for `table.unpack` and global `unpack`.
 * Returns the array slice `t[i..j]` as a JS array (which the
 * stdlib dispatcher wraps as a `MultiValue`). Missing slots in the
 * requested range become `null` so multi-target callers see them as
 * nil rather than truncating the result.
 */
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
  // Luau caps unpack at LUAI_MAXCSTACK-ish result counts — unpacking
  // 8000 elements must trap while 7999 succeeds (tables.luau).
  if (j - i + 1 > 7999) {
    throw new StoryException("too many results to unpack");
  }
  const out: any[] = [];
  for (let k = i; k <= j; k++) {
    out.push(map.get(String(k)) ?? null);
  }
  return out;
}

// ============================================================
// utf8 byte model (lutf8lib.cpp port).
//
// Sparkdown strings follow the byte-string convention the rest of
// the string library uses (string.pack / byte / char / sub): every
// JS char with code <= 0xFF IS one byte — so `"\xE3"` is the raw
// (invalid) byte E3, exactly as in Lua source. Chars above 0xFF
// (real text like "汉") expand to their UTF-8 encoding so
// `utf8.len("汉字") == 2` still holds for narrative text. Latin-1
// chars typed directly as text (`"é"`, U+00E9) are therefore RAW
// BYTES from utf8's point of view — byte-true code should build
// such strings via utf8.char or `\xNN` escapes.
// ============================================================

function luauStringToBytes(s: string): number[] {
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

// utf8_decode (lutf8lib.cpp): decode one sequence starting at byte
// index `i`. Returns the codepoint + index just past the sequence,
// or null for any invalid sequence (bad continuation, overlong,
// > U+10FFFF, surrogates).
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
    cshift = (cshift << 1) & 0xff_ff; // keep it a small int; bits used below
  }
  res |= (cshift & 0x7f) << (count * 5);
  if (count > 3 || res > 0x10ffff || res <= UTF8_DECODE_LIMITS[count]!) {
    return null;
  }
  if (res >= 0xd800 && res < 0xe000) return null; // surrogate
  return { code: res, next: i + count + 1 };
}

const utf8IsCont = (bytes: number[], i: number) =>
  ((bytes[i] ?? 0) & 0xc0) === 0x80;

// u_posrelat (lutf8lib.cpp): negative positions count from the end.
function utf8PosRelat(pos: number, len: number): number {
  if (pos >= 0) return pos;
  if (-pos > len) return 0;
  return len + pos + 1;
}

/**
 * Walk `s` and produce the byte offset (0-based, into the UTF-8
 * encoding) of each code-point boundary, plus a trailing entry for
 * the end of the string. Used by `utf8.len` and `utf8.offset` to
 * answer "what byte position is the n-th character at?" without
 * eagerly building the full byte array. The second tuple element is
 * the total UTF-8 byte length of `s`.
 */
function utf8CodepointOffsets(s: string): [number[], number] {
  const offsets: number[] = [];
  let bo = 0;
  for (const cp of s) {
    offsets.push(bo);
    const code = cp.codePointAt(0)!;
    if (code < 0x80) bo += 1;
    else if (code < 0x800) bo += 2;
    else if (code < 0x10000) bo += 3;
    else bo += 4;
  }
  offsets.push(bo);
  return [offsets, bo];
}

// Re-export the method-dispatch surface so external callers
// (compiler, runtime engine) see one entry point. The actual table
// and helpers live in `MethodDispatch.ts` to keep this file small.
export {
  callBuiltinMethod,
  isBuiltinMethod,
  METHOD_DISPATCH,
  METHOD_PREFIX,
} from "./MethodDispatch";

// An alias entry resolves a Luau-style source name to an ink-runtime
// builtin name. Most entries are a single fixed string. Some methods
// dispatch on arg count (e.g. `story.turns()` → `TURNS`,
// `story.turns(-> t)` → `TURNS_SINCE`) — for those, the entry is a
// function that takes the call's arg count and returns the resolved
// name (or `null` if the arity isn't supported).
export type InkBuiltinAlias = string | ((argCount: number) => string | null);

// Unified Luau standard library. Each entry is a one-line
// registration; the `pure?` flag controls the dispatch path:
//
// - `pure: true` — `fn` is a pure JS function `(_, [a, b]) => number`
//   (ignores `story`). Auto-registered with `NativeFunctionCall` at
//   engine init so it benefits from the type-coercion fast path
//   (int/float operand dispatch, list-membership flag, etc.). Used
//   for `math.*` numeric helpers.
//
// - `pure` omitted — `fn` is state-aware `(story, args) => result`
//   and routes through the generic `RunStdLibFunction` ControlCommand
//   dispatcher. Used for `assert`, `plural.category`, `math.random`,
//   `count.*`, and (future) `error`, `tostring`, etc.
//
// Adding a new entry — pure or state-aware — is one line:
//   "math.atan2": { arity: 2, pure: true, fn: (_, [y, x]) => Math.atan2(y, x) },
//   tostring:     { arity: 1, fn: (_, [v]) => String(coerceNumber(v) ?? v) },
//
// At lowering, `makeGlobalFunctionCall` (lowerExpression.ts) and
// `lookupStdLibBuiltin` (below) consult this table by dotted full
// name. The `FunctionCall` constructed carries that name verbatim;
// dispatch in `GenerateIntoContainer` branches on `pure`.

// ----------------------------------------------------------------
// Built-in iterators (for `pairs` / `ipairs`)
// ----------------------------------------------------------------

// Sentinel key on a closure-shaped `ObjectValue` marking it as a
// stdlib iterator. The runtime's `CallValueAsFunction` handler
// (Story.ts) checks for this BEFORE the closure-path check and
// dispatches to the registered iterator below instead of trying to
// divert to a user-defined target.
export const BUILTIN_ITER_TAG = "__builtin_iter";

// Sentinel key marking an `ObjectValue` as the `_G` globals-table
// proxy. A bare `_G` reference resolves to a fresh marker-tagged
// ObjectValue (identity doesn't matter — only the tag is checked);
// the runtime's `IndexValue` / `StoreIndex` handlers route reads and
// writes through `VariablesState` global storage when they see it,
// so `_G.foo = 1` / `_G['foo']` behave as Luau's global-environment
// access without a real backing table.
export const GLOBALS_PROXY_TAG = "__globals_proxy";
// Auxiliary state — table to iterate, plus a cursor. Stored on the
// same ObjectValue so each call can advance the cursor in place.
const BUILTIN_ITER_STATE = "__builtin_iter_state";
const BUILTIN_ITER_CURSOR = "__builtin_iter_cursor";

// Per-iterator step function. Receives the captured iterator state
// (table for `pairs`/`ipairs`, or a small wrapper ObjectValue for
// `gmatch`) and the previous cursor; returns the next yielded values
// + the cursor to record for the next step, or `null` when iteration
// ends. The runtime packages `values` as a `MultiValue` so generic-
// for's multi-assignment binds the user's loop variables — pairs /
// ipairs return [key, value] (length 2), `gmatch` returns N captures.
type IterStep = (
  state: AbstractValue,
  cursor: AbstractValue | null,
  // The iterator's own marker map — per-iteration scratch space
  // (e.g. pairs' key snapshot). Null when the step is driven with
  // explicit state (`next`-style calls) instead of a live iterator.
  scratch?: Map<string, AbstractValue> | null,
) => { values: AbstractValue[]; nextCursor: AbstractValue } | null;

// Scratch key holding pairs' key snapshot (a raw string[] smuggled
// through the AbstractValue-typed marker map).
const ITER_KEY_SNAPSHOT = "__iter_key_snapshot";

const BUILTIN_ITERATORS: Record<string, IterStep> = {
  // `pairs(t)` — visit every key in insertion order. Cursor is the
  // previous key (string in the underlying Map). `nil` cursor →
  // start at the first entry. Keys are SNAPSHOTTED at iteration
  // start (when scratch is available): Lua allows clearing the
  // CURRENT field during traversal, and a live scan can't find the
  // successor of a deleted cursor. Keys deleted since the snapshot
  // are skipped at step time; keys added mid-iteration aren't
  // visited (Lua leaves that unspecified).
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
    // Skip entries deleted since the snapshot.
    while (idx < keys.length && !map.has(keys[idx]!)) idx++;
    if (idx >= keys.length) return null;
    const key = keys[idx]!;
    const value = map.get(key)! as AbstractValue;
    const keyValue: AbstractValue = /^-?\d+$/.test(key)
      ? new IntValue(parseInt(key, 10))
      : new StringValue(key);
    return {
      values: [keyValue, value],
      // Cursor is stored as a string for stable round-tripping (Maps
      // key on string in sparkdown).
      nextCursor: new StringValue(key),
    };
  },
  // `ipairs(t)` — visit integer keys 1..N stopping at the first gap.
  // Cursor is the previous integer index; `nil` → start at 0,
  // returning 1 next.
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
    // Lua: ipairs stops at the FIRST nil value, not just a missing
    // key — `ipairs({5, 6, 7, nil, 8})` iterates k=1..3 even though
    // slot 5 holds 8 (basic.luau lines 224-226).
    if (v instanceof NullValue) return null;
    return { values: [new IntValue(i), v], nextCursor: new IntValue(i) };
  },
  // `utf8codes(s)` — iter_aux (lutf8lib.cpp). Each step yields the
  // 1-indexed byte position + codepoint of the next character. The
  // control value is the byte position of the PREVIOUS character (0
  // on the first call), so the iterator also works when called
  // directly with explicit (s, n) args — `local f = utf8.codes("");
  // f("", 2)` (utf8.luau lines 122-125). Malformed sequences raise
  // "invalid UTF-8 code" (trappable).
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
      n = 0; // first iteration
    } else if (n < len) {
      n++; // skip current byte
      while (utf8IsCont(bytes, n)) n++; // and its continuations
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
  // `gmatch(s, pattern)` — iterate every non-overlapping match. The
  // state is a wrapper ObjectValue carrying `{input, pattern}`; the
  // cursor is an IntValue holding the next 0-indexed search offset.
  // Each step yields the captures (or whole match if pattern has no
  // captures) as a variable-arity MultiValue. Returns null on no
  // further match — terminates the generic-for loop.
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
      // Compile errors surface at call site (gmatch entry below)
      // before we ever get here, but be defensive.
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
    // Empty match → step forward 1 byte so we don't loop forever on
    // patterns like `%a*`.
    const nextOffset = matched.length === 0 ? matchEnd + 1 : matchEnd;
    return { values, nextCursor: new IntValue(nextOffset) };
  },
};

// Wrapper-ObjectValue field names for `gmatch` iterator state. The
// state ObjectValue is keyed under `BUILTIN_ITER_STATE` on the
// iterator itself; these two extra keys live INSIDE that wrapper.
const GMATCH_INPUT = "__gmatch_input";
const GMATCH_PATTERN = "__gmatch_pattern";
// Wrapper field for `utf8codes` iterator state.
const UTF8CODES_INPUT = "__utf8codes_input";

/**
 * Build a closure-shaped `ObjectValue` marked as a stdlib iterator.
 * `CallValueAsFunction` (Story.ts) detects the `__builtin_iter` key
 * and dispatches to the matching `BUILTIN_ITERATORS` entry, mutating
 * the cursor on this ObjectValue between invocations.
 */
function makeBuiltinIterator(name: string, table: ObjectValue): ObjectValue {
  const map = new Map<string, AbstractValue>();
  map.set(BUILTIN_ITER_TAG, new StringValue(name));
  map.set(BUILTIN_ITER_STATE, table);
  map.set(BUILTIN_ITER_CURSOR, new NullValue());
  return new ObjectValue(map);
}

/**
 * Runtime entry point: advance the iterator one step. Returns the
 * yielded values as a `MultiValue` (or the single value directly when
 * there's only one), or a `NullValue` when iteration ends. Called
 * from `Story.ts`'s `CallValueAsFunction` handler and the
 * variable-divert dispatch path.
 *
 * STATELESS mode (Lua's iterator protocol): when the call site passes
 * an explicit non-nil `state` arg — `ipairs(t)` returns the triple
 * `(iterator, t, 0)` so generic-for threads the real table and
 * previous control value, and manual calls like `inext(t, 2)` pass
 * them directly (basic.luau line 230) — the step uses the PASSED
 * (state, control) and the marker's internal cursor is neither read
 * nor written.
 *
 * STATEFUL fallback: iterators whose state can't be expressed in the
 * (state, control) protocol (`gmatch`, `utf8codes` — also Lua's own
 * stateful-iterator pattern) return just the marker, so generic-for
 * passes state=nil and the internal STATE/CURSOR fields drive the
 * iteration as before.
 */
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
    // The marker map still serves as per-iteration scratch (pairs'
    // key snapshot) — a fresh marker is minted per `pairs(t)` call,
    // and a nil ctrl (loop start) refreshes the snapshot.
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
    // End-of-iteration — leave the cursor untouched, return nil.
    return new NullValue();
  }
  map.set(BUILTIN_ITER_CURSOR, result.nextCursor);
  if (result.values.length === 0) return new NullValue();
  if (result.values.length === 1) return result.values[0]!;
  return new MultiValue(result.values);
}

export const STDLIB: Record<string, StdLibEntry> = {
  // ============================================================
  // `math.*` — pure numeric helpers (auto-registered with NativeFunctionCall)
  // ============================================================
  "math.abs": { arity: 1, pure: true, fn: (_, [v]) => Math.abs(v) },
  "math.acos": { arity: 1, pure: true, fn: (_, [v]) => Math.acos(v) },
  "math.asin": { arity: 1, pure: true, fn: (_, [v]) => Math.asin(v) },
  // `math.atan(x)` / `math.atan(y, x)` — the 2-arg form was added
  // in Lua 5.3 (replacing `math.atan2`) and is also in Luau. Routes
  // through `Math.atan2` when both args are present.
  "math.atan": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) =>
      args.length >= 2 ? Math.atan2(args[0], args[1]) : Math.atan(args[0]),
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
  // `math.fmod(a, b)` matches Lua's truncate-toward-zero remainder,
  // which is the same behavior as JavaScript's `%` operator (sign
  // follows dividend).
  "math.fmod": { arity: 2, pure: true, fn: (_, [a, b]) => a % b },
  "math.ldexp": {
    arity: 2,
    pure: true,
    fn: (_, [m, e]) => m * Math.pow(2, e),
  },
  // `math.modf(x)` — Lua/Luau multi-return: integer part and
  // fractional part. The integer part has the same sign as `x` and
  // its absolute value is `floor(|x|)`. Returning a JS array signals
  // multi-return to the dispatcher, which wraps the elements as a
  // `MultiValue` and pushes one stack slot. Consumers:
  //   - `local i, f = math.modf(x)` — `UnpackTuple` distributes
  //   - `local x = math.modf(3.7)` — auto-unwrap → first value (3)
  //   - `print(math.modf(x))` — first value only (single-arg context)
  "math.modf": {
    arity: 1,
    fn: (_, [x]) => {
      const n = coerceNumber(x) ?? 0;
      const intPart = n >= 0 ? Math.floor(n) : Math.ceil(n);
      return [intPart, n - intPart];
    },
  },
  // `math.frexp(x)` — multi-return: mantissa `m` and exponent `e`
  // such that `x = m * 2^e`, with `0.5 <= |m| < 1` (or `m = 0`
  // when `x = 0`). The inverse of `math.ldexp`.
  "math.frexp": {
    arity: 1,
    fn: (_, [x]) => {
      const n = coerceNumber(x) ?? 0;
      if (n === 0 || !isFinite(n) || isNaN(n)) return [n, 0];
      const sign = n < 0 ? -1 : 1;
      const absX = Math.abs(n);
      let e = Math.floor(Math.log2(absX)) + 1;
      let m = absX / Math.pow(2, e);
      // Boundary correction for log2 precision quirks.
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
  // `math.log(x [, base])` — Lua 5.2+ / Luau accept an optional
  // base. With one arg, returns natural log. With two args, returns
  // `log(x) / log(base)`.
  "math.log": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) =>
      args.length >= 2 ? Math.log(args[0]) / Math.log(args[1]) : Math.log(args[0]),
  },
  "math.log10": { arity: 1, pure: true, fn: (_, [v]) => Math.log10(v) },
  // `math.max(a, b, ...)` / `math.min(a, b, ...)` — Luau variadic.
  // Pure: NativeFunctionCall registers them with VARIADIC_ARITY; the
  // call site captures the actual arg count.
  // Pairwise fold seeded from the FIRST argument (Luau semantics):
  // a leading NaN propagates (`math.min(nan, 2)` is nan — every
  // comparison against nan is false, so the accumulator never
  // replaces) while a non-leading NaN loses (`math.min(1, nan)` is
  // 1) — math.luau lines 302-305.
  "math.max": {
    arity: -1,
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
  // C round(): half away from ZERO (JS Math.round goes toward +inf,
  // so Math.round(-0.5) is -0 not -1) and WITHOUT the `v + 0.5`
  // double-rounding bug (`math.round(0.49999999999999994)` must be
  // 0; adding 0.5 rounds the sum up to exactly 1) — math.luau
  // round section.
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
  // NaN signs as 0 in Luau (JS Math.sign(NaN) is NaN) — math.luau
  // line 326.
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

  // ============================================================
  // State-aware entries (route through `RunStdLibFunction`)
  // ============================================================

  // `plural.category(n)` — CLDR plural category for `n` in the
  // active language (`lang.current` store; defaults to `"en"`).
  // Used directly (`{plural.category(n)}`) and as the desugar
  // target for `plural(n)|one=...|other=...` alternators. Returns
  // a string (`"zero"` / `"one"` / `"two"` / `"few"` / `"many"` /
  // `"other"`) which the generic dispatcher auto-wraps as a
  // StringValue.
  "plural.category": {
    arity: 1,
    fn: (story, [nVal]) => {
      const n = coerceNumber(nVal);
      if (n === null) {
        story.Error("plural.category expected a number, but got " + nVal);
        return "other";
      }
      // Read `lang.current`. Try the dotted name first (flat-namespace
      // store case), fall back to `lang` as an ObjectValue with a
      // `current` key. Default to English when neither is set —
      // missing language data shouldn't be a hard error in a
      // creative-writing runtime.
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

  // `math.random([m [, n]])` — Lua/Luau's polymorphic RNG.
  //   0 args:   float in `[0, 1)`
  //   1 arg:    integer in `[1, m]`
  //   2 args:   integer in `[m, n]`
  // All three forms share the same PRNG, seeded from
  // `state.storySeed + previousRandom` so successive calls are
  // deterministic given the seed. `previousRandom` is updated on
  // every call regardless of form.
  "math.random": {
    arity: -1,
    fn: (story, args) => {
      // Lua accepts at most (m, n) — a third argument raises
      // (math.luau line 258 pattern-matches the message).
      if (args.length > 2) {
        story.Error("math.random: wrong number of arguments");
        return 0;
      }
      const seed = story.state.storySeed + story.state.previousRandom;
      const prng = new PRNG(seed);
      const next = prng.next();
      story.state.previousRandom = next;

      if (args.length === 0) {
        // `next` is a 32-bit unsigned int — divide by 2^32 to get
        // a float in `[0, 1)`. Matches Luau's no-arg form.
        return next / 0x100000000;
      }

      // Integer forms. Resolve min/max based on arity.
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

      // JS has no true integers, so guard against overflow when
      // (max - min + 1) exceeds safe-integer range.
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

  // `math.randomseed([seed])` — set the PRNG seed and reset
  // `previousRandom` to 0. With no arg (Luau form), seeds from the
  // current system time (non-deterministic; runs won't reproduce
  // across saves). Used to make RNG-dependent scripts deterministic
  // across runs when an explicit seed is given.
  "math.randomseed": {
    arity: -1,
    fn: (story, args) => {
      let seed: number;
      if (args.length === 0) {
        // System-derived seed. Lua's behavior is platform-dependent;
        // Luau uses `os.time()`-equivalent. Mirroring that here —
        // sparkdown's narrative-fiction runtime doesn't promise
        // determinism across saves when this form is used.
        seed = Math.floor(Date.now());
      } else {
        const n = coerceNumber(args[0]);
        if (n === null) {
          story.Error("Invalid value passed to math.randomseed");
          return;
        }
        seed = n;
      }
      story.state.storySeed = seed;
      story.state.previousRandom = 0;
    },
  },

  // `count.choices()` — number of currently-presented choices.
  // Exposes ink's narrative-flow `state.generatedChoices.length`
  // under a Luau-style name.
  "count.choices": {
    arity: 0,
    fn: (story) => story.state.generatedChoices.length,
  },

  // `count.turns()` (0-arg form) — total turns elapsed since
  // story start. Maps to `state.currentTurnIndex + 1`.
  // The 1-arg form `count.turns(-> target)` (TURNS_SINCE) still
  // routes through the legacy per-function ControlCommand path
  // because it needs compile-time DivertTarget container-counting
  // setup that doesn't fit the generic dispatcher.
  "count.turns": {
    arity: 0,
    fn: (story) => story.state.currentTurnIndex + 1,
  },

  // `math.clamp(x, min, max)` — Luau-only.
  "math.clamp": {
    arity: 3,
    pure: true,
    fn: (_, [v, min, max]) => Math.min(Math.max(v, min), max),
  },

  // `math.map(x, inMin, inMax, outMin, outMax)` — Luau-only.
  // Linearly remap `x` from input range to output range.
  "math.map": {
    arity: 5,
    pure: true,
    fn: (_, [x, iMin, iMax, oMin, oMax]) =>
      iMax === iMin
        ? oMin
        : oMin + ((x - iMin) / (iMax - iMin)) * (oMax - oMin),
  },

  // `math.noise(x [, y [, z]])` — Luau / Roblox Perlin noise.
  // Returns a deterministic pseudo-random value in roughly `[-1, 1]`
  // (typical range; corners can exceed slightly). The 1- and 2-arg
  // forms call the 3D implementation with the missing axes pinned to
  // 0. Uses Ken Perlin's improved noise algorithm (smoothstep `fade`
  // + 12-direction gradients) with a fixed permutation table — the
  // table differs from Roblox's, so absolute output values won't
  // match Roblox exactly; statistical properties (smoothness,
  // value distribution) do.
  "math.noise": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) =>
      perlinNoise(args[0] ?? 0, args[1] ?? 0, args[2] ?? 0),
  },

  // `math.lerp(a, b, t)` — Luau 0.6+. Linear interpolation between
  // `a` and `b` parameterised by `t` (not clamped — `t` outside [0,1]
  // extrapolates).
  // Luau 0.6+ float classification predicates (math.luau's
  // isnan/isinf/isfinite section). Booleans, not numbers — and they
  // take ANY number (no string coercion needed beyond the pure
  // pipeline's).
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

  // Luau's lerp is EXACT at t == 1 (the naive a + t*(b-a) drifts:
  // math.luau line 417's "(fails for a + t*(b-a))" comment) — the
  // implementation special-cases the endpoint per the lerp RFC.
  "math.lerp": {
    arity: 3,
    pure: true,
    fn: (_, [a, b, t]) => (t === 1 ? b : a + t * (b - a)),
  },

  // `math.ult(a, b)` — Lua 5.3+ / Luau. Unsigned integer less-than:
  // both args are coerced to uint32 before comparison. Returns a
  // boolean.
  "math.ult": {
    arity: 2,
    pure: true,
    fn: (_, [a, b]) => (a >>> 0) < (b >>> 0),
  },

  // `tostring(v)` — coerce to display string. Mirrors Luau:
  // numbers → JS String(), booleans → "true"/"false", nil → "nil",
  // strings unchanged. ObjectValues / other userdata fall back to
  // their JS string form, UNLESS their metatable has `__tostring` —
  // in which case the metamethod is invoked and its (string) return
  // becomes the result. Matches Lua's `tostring(t)` behavior.
  tostring: {
    arity: 1,
    fn: (story, [v]) => {
      // Lua's C-function contract: an ABSENT argument raises
      // (`pcall(tostring) == false`, `tostring(nothing())` likewise);
      // an explicit nil still stringifies to "nil".
      requireStdLibArg(story, v, 1, "tostring");
      if (v == null) return "nil";
      // `__tostring` metamethod — fires first for ObjectValue with a
      // metatable carrying the field. The metamethod is invoked via
      // `story.CallLuauFunction` (same path used by `__add` /
      // `__index` function-form callbacks). The return value is
      // expected to be a string; non-string returns fall through to
      // the default representation.
      if (v instanceof ObjectValue && v.metatable instanceof ObjectValue) {
        const handler = (v.metatable.value as Map<string, AbstractValue>)?.get(
          "__tostring",
        );
        if (handler != null && !(handler instanceof NullValue)) {
          const results = story.CallLuauFunction(handler, [v]);
          const first = results[0];
          if (first instanceof StringValue) return first.value ?? "";
          if (first != null && "value" in (first as any)) {
            const raw = (first as any).value;
            if (typeof raw === "string") return raw;
          }
          // Non-string return from __tostring — fall through to the
          // default. Luau errors here; sparkdown is more lenient
          // since narrative-fiction code often relies on string
          // coercion working broadly.
        }
      }
      const ctorName = v?.constructor?.name;
      // Function values stringify as Lua's `function: <id>` form,
      // not as the underlying JS class name. Sparkdown represents
      // functions as either:
      //   - `DivertTargetValue` (bare knot references / function
      //     literals without captured upvalues)
      //   - `ObjectValue` with `__closure_fn` (closures that captured
      //     upvalues)
      // Both should serialize to a stable opaque token so authors
      // can use tostring(fn) in interpolations without leaking
      // internal representation.
      if (ctorName === "DivertTargetValue") {
        const path = (v as any).value;
        return `function: ${path?.toString?.() ?? "<unknown>"}`;
      }
      if (typeof v === "object" && "value" in v) {
        const map = (v as any).value;
        if (map instanceof Map && map.has("__closure_fn")) {
          const fnTarget = map.get("__closure_fn");
          const path = (fnTarget as any)?.value;
          return `function: ${path?.toString?.() ?? "<closure>"}`;
        }
        // First-class stdlib builtins (`tostring(print)`) are
        // functions, not tables.
        if (map instanceof Map && map.has("__stdlib_fn")) {
          return `function: builtin: ${
            (map.get("__stdlib_fn") as any)?.value ?? "?"
          }`;
        }
        // Plain tables stringify Lua-style as an opaque identity
        // token — `string.find(tostring{}, 'table:')` must match.
        if (map instanceof Map) {
          return `table: ${luauPointerId(map)}`;
        }
        const raw = (v as any).value;
        if (raw == null) return "nil";
        if (typeof raw === "boolean") return raw ? "true" : "false";
        // Lua-format special numbers: nan / inf / -inf / -0.
        if (typeof raw === "number") return luauNumberToString(raw);
        return String(raw);
      }
      if (typeof v === "boolean") return v ? "true" : "false";
      if (typeof v === "number") return luauNumberToString(v);
      return String(v);
    },
  },

  // `tonumber(e [, base])` — parse a string or pass-through a number.
  // Returns `null` (nil) on failure, matching Luau semantics. Base
  // arg supported for integer parsing (`tonumber("ff", 16) == 255`).
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
      // Luau accepts "nan" / "inf" spellings (`tonumber("nan")` is
      // nan, not nil) — parseLuauNumber handles those plus hex.
      return parseLuauNumber(s);
    },
  },

  // `type(v)` — Lua-style type-of string: `"nil"` / `"number"` /
  // `"string"` / `"boolean"` / `"table"` / `"function"` / `"userdata"`.
  // Approximated via the runtime Value subclass's `.value` shape.
  type: {
    arity: 1,
    fn: (story, [v]) => {
      // Lua's C-function contract: `type()` REQUIRES an argument —
      // a missing one (no arg at all, a Void from a function that
      // returned nothing, or an empty multi-return) raises rather
      // than reporting "nil" (`pcall(type) == false`,
      // `pcall(function() return type(nothing()) end) == false`).
      requireStdLibArg(story, v, 1, "type");
      return luauTypeOf(v instanceof MultiValue ? v.values[0] : v);
    },
  },

  // `typeof(v)` — Luau extension: `type(v)` for primitives, otherwise
  // the userdata typeName. Sparkdown doesn't have userdata yet, so
  // it behaves identically to `type` for now.
  typeof: {
    arity: 1,
    fn: (story, [v]) => {
      requireStdLibArg(story, v, 1, "typeof");
      return luauTypeOf(v instanceof MultiValue ? v.values[0] : v);
    },
  },

  // `error(message [, level])` — raise a runtime error. The `level`
  // arg controls the source location attribution in real Lua/Luau;
  // sparkdown ignores it (we don't track call-frame depth in error
  // messages). Force-ends the story like `assert`'s failure path.
  error: {
    arity: 1,
    fn: (story, [msg]) => {
      const raw = coerceString(msg) ?? "error";
      // Hook for hosts that want to inject `<source>:<line>: `
      // prefix into the message (Luau-spec format used by the
      // conformance test suite). Production hosts (LSP) leave the
      // formatter unset — source/line is surfaced through the
      // diagnostic UI separately, so a prefix in the message body
      // would be redundant.
      const message = story.errorMessageFormatter
        ? story.errorMessageFormatter(story, raw)
        : raw;
      // `story.Error` THROWS (raises a `StoryException`), so it's
      // trappable by `pcall`. `story.AddError` would call
      // `ForceEnd`, wiping the call stack and defeating pcall's
      // protection — see project_pcall_protected_dispatch.md.
      story.Error(message);
    },
  },

  // `rawequal(a, b)` — strict equality bypassing metamethods.
  // Sparkdown has no metamethods today, so this is just `===`
  // on the underlying primitive values.
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

  // `print(...)` — Luau's variadic console output. Sparkdown's
  // narrative-fiction runtime has no implicit stdout, so this is a
  // no-op by default. Variadic: pops `arity` args set at compile
  // time (the call-site arg count). Users who want output should
  // emit display text via sparkdown's regular `:` / `..` syntax.
  print: {
    arity: -1, // variadic — actual count comes from compile-site capture
    fn: (_, _args) => {
      // intentional no-op; could route to a host hook if needed
    },
  },

  // ============================================================
  // Stubs for reserved Luau globals we haven't implemented yet.
  // Without these, calls like `setmetatable({})` lower to a divert
  // (`-> setmetatable`) and fail at compile time with "target not
  // found". With these stubs, the call lowers to a state-aware
  // stdlib invocation that throws a runtime error — which is
  // (a) Lua-compatible (matches `attempt to call a nil value`),
  // (b) trappable by `pcall` so authors can defensively call
  // optional features, and (c) discoverable: the error message
  // points at exactly which feature is missing.
  // ============================================================
  // `setmetatable(t, mt)` — attach `mt` (or nil to clear) to `t`'s
  // metatable slot. Returns `t`. Errors if `t` isn't a table, if `mt`
  // is neither nil nor a table, or if `t`'s existing metatable has a
  // `__metatable` field (Luau metatable protection).
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
      // Luau metatable protection: if the current metatable carries a
      // `__metatable` field, refuse to replace it. Same field protects
      // `getmetatable` too — see below.
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
      if (mt == null || mt instanceof NullValue) {
        t.metatable = null;
      } else if (mt instanceof ObjectValue) {
        t.metatable = mt;
      } else {
        story.Error("setmetatable: second argument must be a table or nil");
        return;
      }
      return t;
    },
  },
  // `getmetatable(t)` — returns `t`'s metatable, OR the `__metatable`
  // field if the metatable carries one (Luau metatable protection
  // pattern — lets a class hide its real metatable behind a sentinel
  // so user code can't tamper with it via `setmetatable`).
  // Non-table args return nil (matches Lua's tolerant behavior).
  getmetatable: {
    arity: 1,
    fn: (_, [t]) => {
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
  // `newproxy([metatable])` — Luau-only. Returns a fresh userdata-like
  // value that can carry a metatable. With a `true` arg, the proxy
  // gets its own empty metatable (suitable for later setmetatable).
  // With a table arg, the proxy's metatable is set to that table.
  // The `__userdata` marker key makes `type()` / `typeof()` report
  // "userdata" (NOT "table" — and intentionally NOT spoofable via a
  // `__type` metatable field, matching Luau).
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
      // `newproxy(true)` — give the proxy its own empty metatable
      // (so user code can later mutate it via getmetatable). Any
      // other truthy value follows the same convention; falsy /
      // missing args leave the proxy without a metatable.
      if (isTruthy(arg)) {
        out.metatable = new ObjectValue();
      }
      return out;
    },
  },
  // `loadstring(chunk)` — Lua's contract is to return the compiled
  // chunk as a function, or `(nil, errormessage)` when the chunk
  // fails to load. Sparkdown stories are precompiled (the runtime
  // has no compiler), so EVERY chunk "fails to load": return
  // `(nil, message)` in Lua's chunk-id format rather than raising.
  // This keeps the common defensive pattern
  // `local f, err = loadstring(s) if not f then ... end` working
  // (basic.luau's "load error" assertion checks exactly that shape;
  // the expected message text is patched to ours in
  // upstreamPatches.ts — a documented divergence).
  loadstring: {
    arity: -1,
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
    fn: (story) =>
      story.Error(
        "require: not yet implemented in sparkdown — use `run \"path\"` for .luau loading",
      ),
  },
  collectgarbage: {
    // No-op stub: sparkdown runs on JavaScript's GC, so user code
    // can't force collection or query memory. We accept the call
    // shapes (`collectgarbage()`, `collectgarbage("collect")`,
    // `collectgarbage("count")`, etc.) and return 0 so Luau test
    // suites that sprinkle GC calls between assertions run cleanly —
    // those tests use the calls to provoke specific upvalue-capture
    // and weak-reference timing, not to require the collector to do
    // anything concrete. Returning 0 for `"count"` is a safe
    // approximation (memory tracking isn't available in the harness).
    arity: -1,
    fn: () => 0,
  },
  gcinfo: {
    // No-op stub: pre-Luau alias for `collectgarbage("count")`.
    // See `collectgarbage` rationale above.
    arity: -1,
    fn: () => 0,
  },
  // `getfenv([f])` — Luau keeps this Lua 5.1 builtin (deprecated, and
  // it deoptimizes fastcalls upstream). Sparkdown returns the same
  // globals-proxy table `_G` resolves to, so reads route through
  // global variable storage and `getfenv().math = {...}` writes a
  // global named `math` — which the native-dispatch override hook in
  // Story.ts then prefers over the static stdlib op (basic.luau's
  // testgetfenv reassignment test).
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
    fn: (story) =>
      story.Error(
        "setfenv: removed in Lua 5.2 and not in Luau",
      ),
  },
  // `coroutine.*` — Luau cooperative-thread API. Sparkdown's runtime
  // is single-threaded narrative-flow on inkjs and would need either
  // real fibers or a CPS transform to support coroutines. Stubbed
  // here so authors get clear errors instead of `target not found`
  // when code references them.
  "coroutine.create": {
    arity: -1,
    fn: (story) =>
      story.Error(
        "coroutine.create: not yet implemented in sparkdown (needs fiber / CPS infra)",
      ),
  },
  "coroutine.close": {
    arity: -1,
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
    fn: (story) =>
      story.Error("coroutine.status: not yet implemented in sparkdown"),
  },
  "coroutine.wrap": {
    arity: -1,
    fn: (story) =>
      story.Error("coroutine.wrap: not yet implemented in sparkdown"),
  },
  "coroutine.yield": {
    arity: -1,
    fn: (story) =>
      story.Error("coroutine.yield: not yet implemented in sparkdown"),
  },
  // `task.*` — Roblox task-scheduler API. Depends on coroutine infra
  // and a host frame loop. Stubbed for the same reason as above.
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
  // `buffer.*` — Luau mutable byte-array primitive. Would wrap a
  // Uint8Array; needs a new ValueType.Buffer runtime value. Stubbed
  // for the same reason as above.
  "buffer.create": {
    arity: -1,
    fn: (story) =>
      story.Error("buffer.create: not yet implemented in sparkdown (needs Buffer ValueType)"),
  },
  "buffer.fromstring": {
    arity: -1,
    fn: (story) => story.Error("buffer.fromstring: not yet implemented in sparkdown"),
  },
  "buffer.tostring": {
    arity: -1,
    fn: (story) => story.Error("buffer.tostring: not yet implemented in sparkdown"),
  },
  "buffer.len": {
    arity: -1,
    fn: (story) => story.Error("buffer.len: not yet implemented in sparkdown"),
  },
  // `vector.*` — Luau 3D-vector type. Would need a new ValueType.Vector
  // runtime value (three floats). Stubbed for the same reason as above.
  "vector.create": {
    arity: -1,
    fn: (story) =>
      story.Error("vector.create: not yet implemented in sparkdown (needs Vector ValueType)"),
  },

  // `pcall(f, arg1, ...)` — protected call. Runs `f(arg1, ...)` with
  // errors trapped. Returns `(true, ...returns)` on success or
  // `(false, errorMessage)` on error. The trapped error is removed
  // from the story's error list — it doesn't escape the protected
  // block. See `Story.CallLuauFunctionProtected` for the trap impl.
  pcall: {
    arity: -1,
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
        // Flatten any inner MultiValue from the call's return. The
        // protected callee that did `return 1, 2, 3` left a single
        // MultiValue on the eval stack (via PackTuple at the
        // return); `result.values` is then `[MV([1, 2, 3])]`. To
        // give pcall's caller `(true, 1, 2, 3)` rather than
        // `(true, MultiValue)`, splice the MultiValue's inner
        // values into the result here.
        const flat: AbstractValue[] = [new BoolValue(true)];
        for (const v of result.values) {
          if (v instanceof MultiValue) flat.push(...v.values);
          else flat.push(v);
        }
        return new MultiValue(flat);
      }
      return new MultiValue([
        new BoolValue(false),
        new StringValue(result.errorMessage ?? "pcall: unknown error"),
      ]);
    },
  },

  // `xpcall(f, msgh, arg1, ...)` — protected call with a message
  // handler. On error, `msgh(errMsg)` is called and its return is
  // used as the final error message. Returns `(true, ...returns)` on
  // success or `(false, msgh(err))` on failure.
  //
  // If `msgh` itself raises an error, the original error is
  // returned unchanged (matches Lua's "don't recurse on handler
  // failure" rule).
  xpcall: {
    arity: -1,
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
        return new MultiValue([new BoolValue(true), ...result.values]);
      }
      // Run the message handler. If it fails, fall back to the
      // raw error.
      const errMsg = result.errorMessage ?? "xpcall: unknown error";
      const handlerResult = story.CallLuauFunctionProtected(msgh, [
        new StringValue(errMsg),
      ]);
      const handled =
        handlerResult.ok && handlerResult.values.length > 0
          ? handlerResult.values[0]!
          : new StringValue(errMsg);
      return new MultiValue([new BoolValue(false), handled]);
    },
  },

  // `select(n, ...)` — Lua's variadic-arg helper. Two forms:
  //   - `select("#", ...)` → count of variadic args (single int return)
  //   - `select(n, ...)`   → multi-return: the args starting at index n
  // Negative `n` counts from the end (-1 is the last arg).
  select: {
    arity: -1,
    fn: (story, args) => {
      if (args.length === 0) {
        story.Error("select: missing first argument");
        return 0;
      }
      const first = coerceString(args[0]);
      if (first === "#") {
        return args.length - 1;
      }
      // Lua coerces a numeric-string index (`select('3', ...)` —
      // vararg.luau line 151).
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

  // `rawget(t, k)` — index `t` by `k` bypassing the `__index`
  // metamethod. Sparkdown's `ObjectValue` doesn't have metamethods
  // today, so this is equivalent to `t[k]` — but registering it
  // means user code that calls `rawget` as a function works
  // verbatim.
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
      // Normalize the key to a string — sparkdown's ObjectValue is
      // string-keyed even for numeric indices.
      const key =
        coerceString(k) ??
        (coerceNumber(k) !== null ? String(coerceNumber(k)) : null);
      if (key === null) return null;
      // `_G` globals-table proxy — route the read to global variable
      // storage (the proxy's own map only holds the marker tag).
      if (map.has(GLOBALS_PROXY_TAG)) {
        return story.state.variablesState.GetGlobalVariableValue(key) ?? null;
      }
      return map.get(key) ?? null;
    },
  },

  // `rawset(t, k, v)` — set `t[k] = v` bypassing the `__newindex`
  // metamethod. Returns `t`. As with `rawget`, sparkdown has no
  // metamethods so this is equivalent to plain assignment, but
  // having the function form lets user code use it verbatim.
  // Refuses to mutate a `table.freeze(t)`-frozen table.
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
      // `_G` globals-table proxy — write the global directly
      // (patch-aware via SetGlobal, same as the StoreIndex path).
      if (t.value.has(GLOBALS_PROXY_TAG)) {
        story.state.variablesState.SetGlobal(key, v as AbstractValue);
        return t;
      }
      t.value.set(key, v as AbstractValue);
      return t;
    },
  },

  // ============================================================
  // `string.*` — state-aware string helpers
  // ============================================================
  // `string.char(...)` — variadic. Each arg is a byte value (0-255);
  // Lua's interpretation is byte-oriented, not Unicode-codepoint.
  // `String.fromCharCode` matches that for the byte range (it
  // interprets each value as a UTF-16 code unit, which coincides
  // with bytes for U+0000–U+00FF).
  "string.char": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) => {
      let out = "";
      for (let i = 0; i < args.length; i++) {
        const n = Math.trunc(args[i]!);
        if (!(n >= 0 && n <= 255)) {
          // Trappable — `pcall(function() return string.char(256) end)`
          // must return false (strings.luau line 83).
          throw new StoryException(
            `invalid argument #${i + 1} to 'char' (value out of range)`,
          );
        }
        out += String.fromCharCode(n);
      }
      return out;
    },
  },
  // `string.byte(s [, i [, j]])` — multi-return: the byte codes for
  // each character in `s` from index `i` (default 1) to index `j`
  // (default i). Lua-style 1-indexed; negative indices count from
  // the end. Sparkdown strings are UTF-16 in JS; we use
  // `charCodeAt()` which gives the code-unit value — matches Lua
  // for ASCII, gives the surrogate code unit for higher planes.
  "string.byte": {
    arity: -1,
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
  // `string.rep(s, n [, sep])` — repeat `s` `n` times. Lua 5.3+ accepts
  // an optional `sep` argument inserted between copies (e.g.
  // `string.rep("ab", 3, "-") == "ab-ab-ab"`).
  "string.rep": {
    arity: -1,
    fn: (_, args) => {
      const s = coerceString(args[0]) ?? "";
      const n = Math.max(0, Math.floor(coerceNumber(args[1]) ?? 0));
      if (n === 0) return "";
      const sep = args.length >= 3 ? (coerceString(args[2]) ?? "") : "";
      // Luau caps strings at 1GB (MAXSSIZE) — `pcall(string.rep, 'x',
      // 2e9)` must trap "resulting string too large", not crash JS's
      // String.repeat with a RangeError.
      const total = (s.length + sep.length) * n;
      if (s.length > 0 && total > PACK_MAXSSIZE) {
        throw new StoryException("resulting string too large");
      }
      if (sep === "") return s.repeat(n);
      return new Array(n).fill(s).join(sep);
    },
  },
  // `string.sub(s, i [, j])` — Lua 1-based inclusive substring with
  // support for negative indices counting from the end. `j` defaults
  // to -1 (end of string). Variadic at the call site (2 or 3 args);
  // the registry uses `-1` so the dispatcher passes through whatever
  // the caller provided.
  "string.sub": {
    arity: -1,
    fn: (_, args) => {
      const str = coerceString(args[0]) ?? "";
      let i = coerceNumber(args[1]) ?? 1;
      let j = args.length > 2 ? (coerceNumber(args[2]) ?? -1) : -1;
      if (i < 0) i = Math.max(str.length + i + 1, 1);
      else if (i === 0) i = 1;
      if (j < 0) j = str.length + j + 1;
      else if (j > str.length) j = str.length;
      if (j < i) return "";
      return str.slice(i - 1, j);
    },
  },
  // `string.find(s, pattern [, init [, plain]])` — Lua-style search.
  //
  // Returns multi-value:
  //   - on match: `(start_index, end_index, capture1, capture2, ...)`,
  //     all 1-indexed and inclusive on the end.
  //   - on no match: `nil` (a single NullValue).
  //
  // `init` defaults to 1; negative values count from the end. `plain`
  // (boolean) bypasses pattern compilation and does literal substring
  // search.
  //
  // Patterns are compiled via `luaPatternToJs` — most Lua syntax
  // translates directly to JS regex. Unsupported features (`%b{}`,
  // `%f[]`, position captures) emit a runtime error via story.Error.
  "string.find": {
    arity: -1,
    fn: (story, args) => {
      const s = coerceString(args[0]) ?? "";
      const patternStr = coerceString(args[1]) ?? "";
      const init = resolveInit(args[2], s.length);
      const plain = isTruthy(args[3]);
      if (plain) {
        const idx = s.indexOf(patternStr, init - 1);
        if (idx < 0) return new NullValue();
        // `string.find` returns 1-indexed `(start, end)` inclusive.
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
  // `string.match(s, pattern [, init])` — Lua-style capture extract.
  //
  // Returns multi-value:
  //   - if the pattern has captures: each capture (string).
  //   - if the pattern has no captures: the entire match (single string).
  //   - on no match: `nil`.
  "string.match": {
    arity: -1,
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
  // `string.gsub(s, pattern, repl [, n])` — substitute matches. Lua
  // semantics: returns `(result_string, count_of_substitutions)`. The
  // optional `n` caps the number of replacements (default: all).
  //
  // `repl` may be:
  //   - a STRING template — `%0` (whole match), `%1`-`%9` (capture
  //     refs), `%%` (literal `%`). Any other `%X` errors.
  //   - a TABLE — looked up by `t[first_capture]` (or `t[whole_match]`
  //     if no captures). Nil / false → keep the original match.
  //     String / number → use as replacement. Other types error.
  //   - a FUNCTION — Phase 5, blocked on runtime→Luau callback
  //     dispatch. Currently errors with a friendly message.
  "string.gsub": {
    arity: -1,
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
      // Classify the replacement form. String / number → template;
      // ObjectValue without closure marker → table; ObjectValue WITH
      // closure marker → function (deferred).
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
        // Append unmatched prefix.
        if (matchStart > cursor) out.push(input.slice(cursor, matchStart));
        // Compute replacement.
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
          // Function form. Call the user fn with each capture as an
          // arg (or the whole match if the pattern has no captures).
          // Use the fn's first return value as the replacement.
          // Lua semantics:
          //   - return nil/false → keep the original match
          //   - return string or number → use as replacement
          //   - return anything else → error
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
            story.Error(
              `string.gsub: replacement function threw: ${(e as Error).message}`,
            );
            return new MultiValue([new StringValue(input), new IntValue(0)]);
          }
          let top = results[0];
          // A callback returning a multi-value expression (e.g. a
          // nested `gsub` call) contributes only its FIRST value.
          if (top instanceof MultiValue) top = top.values[0];
          if (
            top == null ||
            top instanceof NullValue ||
            top instanceof Void || // callback with no `return` at all
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
          // Table form. Lookup key is the first capture (string-as-
          // number for position captures) or the whole match.
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
        // Empty match → step forward 1 byte (and append the skipped
        // char) so we don't loop forever on patterns like `%a*`.
        if (matched.length === 0) {
          if (matchStart < input.length) out.push(input.charAt(matchStart));
          cursor = matchStart + 1;
        } else {
          cursor = matchEnd;
        }
      }
      // Append the unmatched tail.
      if (cursor < input.length) out.push(input.slice(cursor));
      return new MultiValue([
        new StringValue(out.join("")),
        new IntValue(count),
      ]);
    },
  },
  // `string.gmatch(s, pattern)` — iterator over every non-overlapping
  // match of `pattern` in `s`. The returned value is a stdlib
  // builtin-iterator (marker-keyed ObjectValue routed through
  // `stepBuiltinIterator`) so generic-for `for cap1, cap2 in
  // string.gmatch(s, p) do … end` yields each capture as a separate
  // loop variable. If the pattern has no captures, each iteration
  // yields the whole match as a single value.
  //
  // The pattern is validated up-front so authors get errors at the
  // `gmatch` call site (line / column point at the bad pattern)
  // rather than deep inside the for-loop dispatch.
  "string.gmatch": {
    arity: 2,
    fn: (story, [sArg, patArg]) => {
      const input = coerceString(sArg) ?? "";
      const pattern = coerceString(patArg) ?? "";
      try {
        // Validate-only — the iterator recompiles per step (cheap;
        // JS engines cache regex compilation).
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
  // `string.format(fmt, ...)` — Lua-style printf. Supports the
  // standard conversion types `d i u o x X e E f g G c s q %` plus
  // the modifier syntax `[flags][width][.precision]`. Flags:
  //   `-` left-align, `+` always sign, ` ` space-prefix positive,
  //   `0` zero-pad, `#` alt form (hex with `0x`, octal with `0`).
  // The variadic args after `fmt` are walked positionally. Unknown
  // specifiers and conversion errors throw via `story.Error`.
  "string.format": {
    arity: -1,
    fn: (story, args) => {
      const fmt = coerceString(args[0]) ?? "";
      const rest = args.slice(1);
      return formatLuaString(story, fmt, rest);
    },
  },
  // `string.split(s, sep)` — Luau extension (not in Lua). Returns a
  // 1-indexed array table of the parts of `s` split on `sep`. When
  // `sep` is the empty string, splits into individual characters.
  // When `sep` doesn't occur in `s`, returns a single-entry array
  // holding `s`.
  "string.split": {
    arity: -1,
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
  // `string.contains(s, sub)` / `string.startswith(s, prefix)` /
  // `string.endswith(s, suffix)` — Luau extensions. Pure substring
  // checks (no Lua patterns). All return a boolean. Lower-case
  // single-word names per Lua convention.
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
  // `string.trim(s)` / `string.trimstart(s)` / `string.trimend(s)` —
  // Luau-style extensions (Lua/Luau have none). Strips ASCII + Unicode
  // whitespace using JS `trim`/`trimStart`/`trimEnd` semantics.
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
  // `string.pack(fmt, ...)` — pack args into a byte string per the
  // format spec. Output is a JS string where each char ∈ [0, 255]
  // (Lua byte-string convention).
  "string.pack": {
    arity: -1,
    fn: (story, args) => {
      const fmt = coerceString(args[0]) ?? "";
      const result = packString(fmt, args.slice(1), story);
      return result == null ? "" : result;
    },
  },
  // `string.unpack(fmt, s [, pos])` — read values out of a byte
  // string per the format spec. Returns each unpacked value as a
  // separate return + the next 1-indexed byte position after the
  // last consumed byte (so a follow-up unpack can resume).
  "string.unpack": {
    arity: -1,
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
  // `string.packsize(fmt)` — byte size of a fixed-width format.
  // Errors on formats containing variable-width specs (`s`, `z`).
  "string.packsize": {
    arity: 1,
    fn: (story, [fmtArg]) => {
      const fmt = coerceString(fmtArg) ?? "";
      const size = packSize(fmt, story);
      return size == null ? 0 : size;
    },
  },

  // ============================================================
  // `bit32.*` — 32-bit integer ops. JS bitwise operators already
  // operate on signed 32-bit ints; `>>> 0` coerces back to unsigned
  // for Lua-style unsigned semantics.
  // ============================================================
  "bit32.bnot": { arity: 1, pure: true, fn: (_, [v]) => (~v) >>> 0 },
  // Lua 5.2 bit32 shift semantics (JS shifts wrap counts mod 32 and
  // have no negative-count handling): a NEGATIVE count shifts the
  // OTHER direction, counts >= 32 saturate to 0 (or to all-ones for
  // arshift of a negative-signed value) — bitwise.luau lines 59-76.
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
  // Luau-only bit32 extensions
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
      // count trailing zeros: 31 - clz(x & -x)
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
  // Variadic bit32 ops. Pure: NativeFunctionCall handles variadic
  // via `VARIADIC_ARITY`; the per-call arity is captured at the
  // FunctionCall site.
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
      // True iff the AND of all args is non-zero.
      let r = 0xffffffff;
      for (const n of args) r &= n >>> 0;
      return r !== 0;
    },
  },
  // `bit32.extract(n, field [, width])` — extract `width` bits
  // starting at `field` (LSB = 0). Default width is 1.
  "bit32.extract": {
    arity: -1,
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
  // `bit32.replace(n, v, field [, width])` — replace `width` bits
  // at `field` with the low bits of `v`.
  "bit32.replace": {
    arity: -1,
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

  // ============================================================
  // `table.*` — read-only table helpers. Mutating fns (`insert`,
  // `remove`, `sort`, `clear`) and constructors (`pack`, `clone`,
  // `create`, `move`) are blocked on an ObjectValue mutation/
  // construction API.
  // ============================================================
  // `table.getn(t)` — Lua 5.1 / Luau. Length of the array portion
  // of `t`, equivalent to `#t`. Walks consecutive integer keys
  // ("1", "2", ...) until the first gap. Linear in the array length;
  // good enough for sparkdown's typical narrative-fiction tables.
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
  // `table.maxn(t)` — Lua 5.1 / Luau. Returns the largest positive
  // numeric key in `t`, or 0 if none. Unlike `table.getn` / `#t`,
  // this scans every key (not just contiguous integers) — useful for
  // sparse arrays. Keys are stored as strings in the underlying Map,
  // so we test each for an exact integer string match before parsing.
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
        // Largest positive NUMERIC key — Lua's maxn counts floats
        // too (`maxn{[24.5] = 3} == 24.5`). Identity-key markers
        // (`__tableid:N`) and plain string keys parse as NaN.
        const n = Number(k);
        if (Number.isFinite(n) && n > max) max = n;
      }
      return max;
    },
  },
  // `table.concat(t [, sep [, i [, j]]])` — join the array portion
  // of `t` (1-based indices i..j) into a single string, with `sep`
  // between elements. Numeric elements are stringified; non-string,
  // non-number elements raise an error (matches Lua).
  "table.concat": {
    arity: -1,
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
          // `pcall(table.concat, t, false)` must trap — an explicit
          // non-string/non-number separator is an argument error.
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
  // `table.find(t, value [, init])` — Luau-only. Linear search of
  // `t`'s array portion for the first index `k >= init` whose value
  // equals `value` (using rawequal-style strict equality on
  // unwrapped primitives). Returns the index, or `null` (nil) if
  // not found. `init` defaults to 1.
  "table.find": {
    arity: -1,
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
        // ltablib tfind: `luaL_argcheck(init > 0, "index out of range")`
        // — pcall(table.find, {}, 42, 0) must trap.
        story.Error("table.find: index out of range");
        return null;
      }
      // Lua's `__eq` rule, as in equality ops: both operands tables,
      // both metatables carry __eq, and the handlers are the same
      // value — then the handler decides (tables.luau lines 418-455).
      const eqViaMetamethod = (a: any, b: any): boolean => {
        if (!(a instanceof ObjectValue) || !(b instanceof ObjectValue)) {
          return false;
        }
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
        const top = results?.[0];
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
  // `table.foreach(t, fn)` — Lua 5.1, deprecated in Luau but kept
  // in the surface. Iterates every key/value pair in insertion
  // order, calling `fn(k, v)` for each. If `fn` returns a non-nil
  // value, iteration stops and that value is returned.
  //
  // Modern Luau code should use `for k, v in pairs(t) do …` instead
  // — the diagnostic at the call site flags this with a strikethrough.
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
        // Lua key form: numeric strings become integers (matches the
        // `pairs` iterator's key-coercion rule).
        const keyValue: AbstractValue = /^-?\d+$/.test(k)
          ? new IntValue(parseInt(k, 10))
          : new StringValue(k);
        const results = story.CallLuauFunction(fn, [keyValue, v]);
        // Lua semantics: only an EXPLICIT non-nil return breaks the
        // loop. A function with no `return` statement ends in a Void
        // value (sparkdown's "no return value" sentinel) — treat it
        // as nil. NullValue and false-valued returns... actually
        // false DOES break in Lua (it's non-nil). But Void doesn't.
        const top = results[0];
        if (
          top != null &&
          !(top instanceof NullValue) &&
          top.constructor.name !== "Void"
        ) {
          return top;
        }
      }
      return new NullValue();
    },
  },
  // `table.foreachi(t, fn)` — Lua 5.1, deprecated in Luau. Like
  // `table.foreach` but only over the array portion (consecutive
  // integer keys 1..N) and calls `fn(i, v)`. Same early-exit rule:
  // non-nil return ends iteration.
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
        // Lua semantics: only an EXPLICIT non-nil return breaks the
        // loop. A function with no `return` statement ends in a Void
        // value (sparkdown's "no return value" sentinel) — treat it
        // as nil. NullValue and false-valued returns... actually
        // false DOES break in Lua (it's non-nil). But Void doesn't.
        const top = results[0];
        if (
          top != null &&
          !(top instanceof NullValue) &&
          top.constructor.name !== "Void"
        ) {
          return top;
        }
        i++;
      }
      return new NullValue();
    },
  },
  // `table.insert(t [, pos], value)` — append (2-arg) or insert at
  // `pos` shifting later elements right (3-arg). Refuses if `t` is
  // frozen. Returns nothing.
  "table.insert": {
    arity: -1,
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
        // ltablib's tinsert shifts up only for in-range positions
        // (1 <= pos <= len); anything else — 0, past-the-end,
        // negative, NaN — just sets t[pos] = v directly
        // (tables.luau's "out of range insertion" block).
        if (pos >= 1 && pos <= len) {
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
      map.set(String(pos), value);
      return undefined;
    },
  },
  // `table.remove(t [, pos])` — remove element at `pos` (default
  // last) and shift later elements left. Returns the removed value
  // or nil. Refuses on a frozen table.
  "table.remove": {
    arity: -1,
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
  // `table.sort(t [, comp])` — in-place sort of the array portion.
  // Default comparator is `<`. A user-supplied `comp` is a sparkdown
  // function value (closure ObjectValue or DivertTargetValue) that
  // receives two elements and returns truthy iff the first should
  // sort before the second — same semantics as Lua's `comp(a, b)`.
  //
  // The comparator is invoked via `story.CallLuauFunction`, which
  // synchronously re-enters the eval loop, runs the user fn, and
  // returns its push results. Output is suppressed during each call
  // so the comparator can't leak narrative text into the story.
  "table.sort": {
    arity: -1,
    validatesArgs: true,
    fn: (story, args) => {
      const t = requireTableArg(story, args[0], 1, "sort");
      // Luau validates the comparator's TYPE up front — even for
      // tables too short to sort, `table.sort({}, 42)` raises
      // (sort.luau line 43).
      const cmpArg = args[1];
      if (
        cmpArg !== undefined &&
        !(cmpArg instanceof NullValue) &&
        (cmpArg as any)?.constructor?.name !== "Void"
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
      // Extract the array portion (consecutive integer keys 1..n).
      let len = 0;
      while (map.has(String(len + 1))) len++;
      if (len < 2) return undefined;
      const arr: AbstractValue[] = [];
      for (let k = 1; k <= len; k++) {
        arr.push(map.get(String(k)) as AbstractValue);
      }
      // Optional comparator. When omitted, fall back to the default
      // `<` comparator on the unwrapped values.
      // Treat explicit nil same as missing — Luau semantics:
      // `table.sort(t, nil)` falls back to the default `<` comparator.
      const compArg = args.length > 1 ? args[1] : null;
      const comp =
        compArg == null || compArg instanceof NullValue ? null : compArg;
      const defaultLess = (a: AbstractValue, b: AbstractValue): boolean => {
        const av = (a as any)?.value;
        const bv = (b as any)?.value;
        if (typeof av === "number" && typeof bv === "number") return av < bv;
        if (typeof av === "string" && typeof bv === "string") return av < bv;
        // Lua's `<`: tables compare through their `__lt` metamethod
        // (sort.luau line 112 sorts metatabled records with the
        // DEFAULT comparator).
        const mt = (a as { metatable?: any })?.metatable;
        const ltFn =
          mt != null && mt.value instanceof Map ? mt.value.get("__lt") : null;
        if (ltFn != null && !(ltFn instanceof NullValue)) {
          const results = story.CallLuauFunction(ltFn, [a, b]) as
            | AbstractValue[]
            | null;
          const top = results?.[0];
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
          const top = results[0];
          if (top == null) return false;
          return isTruthy(top);
        } catch (e) {
          story.Error(`table.sort: comparator threw: ${(e as Error).message}`);
          aborted = true;
          return false;
        }
      };
      // In-place sort via the host's `Array.prototype.sort`. JS's
      // sort is stable as of ES2019 — same guarantee as Lua's
      // semantics (well, Lua doesn't guarantee stability, but
      // stable is a strict superset).
      arr.sort((a, b) => {
        if (aborted) return 0;
        if (less(a, b)) return -1;
        if (less(b, a)) return 1;
        return 0;
      });
      if (aborted) return undefined;
      // Write sorted values back into the map.
      for (let k = 1; k <= len; k++) {
        map.set(String(k), arr[k - 1]!);
      }
      return undefined;
    },
  },
  // `table.clear(t)` — Luau-only. Empty all entries (array + hash
  // portion). Refuses on a frozen table.
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
      // Luau's table.clear RETAINS the allocated array part — a
      // cleared 16-element table behaves like table.create(16) for
      // `#` border searches (clear.luau's length-mismatch loop).
      let len = 0;
      while (map.has(String(len + 1))) len++;
      const prevCap = (map as any).__luauCapacity ?? 0;
      map.clear();
      (map as any).__luauCapacity = Math.max(prevCap, len);
      (map as any).__luauBoundary = 0;
      return undefined;
    },
  },
  // `table.clone(t)` — Luau-only. Shallow copy. Returns a NEW
  // table with the same entries; the new table is **not** frozen
  // even if the source was (matches Luau).
  "table.clone": {
    arity: 1,
    fn: (story, [t]) => {
      if (!(t instanceof ObjectValue)) {
        story.Error("table.clone: argument must be a table");
        return null;
      }
      // Luau's tclone refuses tables with a protected metatable.
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
      // The clone shares the source's metatable (same object), but
      // NOT its frozen state (`table.clone(table.freeze(t))` yields
      // a mutable copy).
      clone.metatable = t.metatable ?? null;
      return clone;
    },
  },
  // `table.create(count [, value])` — Luau-only. New table with
  // `count` entries at keys "1".."count", each holding `value`
  // (defaults to nil — entries are omitted in that case since Lua
  // nil ≡ absent key). Shares one reference across all slots
  // (Lua semantics; mutations to a shared table propagate).
  "table.create": {
    arity: -1,
    fn: (story, args) => {
      const count = coerceNumber(args[0]);
      if (count === null || !Number.isInteger(count) || count < 0) {
        story.Error(
          "table.create: first argument must be a non-negative integer",
        );
        return null;
      }
      // Luau caps the preallocated array size — `pcall(table.create,
      // 1e9)` must trap (tables.luau line 768).
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
      // Array-part capacity hint — `#` consults this so
      // `local t = table.create(5); t[5] = 5; #t == 5` ("magic")
      // matches Luau's array-sized border search.
      (map as any).__luauCapacity = count;
      return new ObjectValue(map);
    },
  },
  // `table.pack(...)` — variadic. Returns a new table holding each
  // arg at "1".."N" plus an integer `n = N` field — the standard
  // way Lua callers can recover the original arg count when nil
  // values are present.
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
  // `table.move(a1, f, e, t [, a2])` — Lua 5.3+. Copy elements
  // `a1[f..e]` to `a2[t..t+e-f]`. `a2` defaults to `a1` (in-place
  // move). Returns `a2`. Handles overlapping ranges by picking the
  // safe iteration direction. Refuses if `a2` is frozen.
  // `table.move(a1, f, e, t [, a2])` — mirrors Luau's `tmove`:
  // integer args validate FIRST (so `table.move(1, 2, 3, 4)` reports
  // arg #1's type error only after 2-4 check out), ranges guard
  // against 32-bit overflow with Luau's exact messages, and nil
  // source slots CLEAR the destination slot (moving a range
  // containing nils deletes the corresponding keys — Lua 5.4
  // semantics the fixture checks with `eqT(a, {1, 10, nil, nil, 5})`).
  "table.move": {
    arity: -1,
    fn: (story, args) => {
      const INT_MAX = 2147483647;
      const checkInt = (v: any, idx: number): number => {
        const missing =
          v === undefined ||
          v?.constructor?.name === "Void" ||
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
      // Explicit nil (or absent) 5th arg means "same table as a1".
      const a5 = args.length > 4 ? args[4] : undefined;
      const a5Absent =
        a5 === undefined ||
        a5 instanceof NullValue ||
        a5?.constructor?.name === "Void";
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
        // Forward unless the ranges overlap within the same table in
        // a way that would clobber unread source slots.
        if (t > e || t <= f || dst !== src) {
          for (let i = 0; i < n; i++) copy(i);
        } else {
          for (let i = n - 1; i >= 0; i--) copy(i);
        }
      }
      return a2;
    },
  },
  // `table.freeze(t)` — Luau-only. Marks `t` read-only. Subsequent
  // calls to `rawset`/`table.insert`/`table.remove`/`table.clear`/
  // `table.move` (when targeting this table) will error. Returns
  // the same `t` so call sites can chain (`local t = table.freeze({...})`).
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
      // Luau's tfreeze refuses tables with a PROTECTED metatable
      // (`__metatable` set) — tables.luau lines 512-516.
      if (t.metatable instanceof ObjectValue) {
        const protect = (
          t.metatable.value as Map<string, AbstractValue>
        )?.get("__metatable");
        if (protect != null && !(protect instanceof NullValue)) {
          story.Error("table.freeze: table has a protected metatable");
          return t;
        }
      }
      t.Freeze();
      return t;
    },
  },
  // `table.isfrozen(t)` — Luau-only. True if `t` has been
  // `table.freeze`d. Non-table arguments return false rather than
  // raising (mirrors Luau's tolerant behavior).
  "table.isfrozen": {
    arity: 1,
    fn: (_, [t]) => t instanceof ObjectValue && t.isFrozen,
  },
  // `table.unpack(t [, i [, j]])` — multi-return: `t[i], t[i+1], …, t[j]`.
  // Default `i = 1`, default `j = #t`. Missing slots in the range are
  // emitted as nil so callers can detect holes via positional binding.
  // Lua 5.1 had this as the global `unpack`; Luau exposes both names
  // (see the `unpack` entry below).
  "table.unpack": {
    arity: -1,
    fn: (story, args) => unpackImpl(story, args, "table.unpack"),
  },
  // `unpack(t [, i [, j]])` — Lua 5.1 / Luau global. Identical to
  // `table.unpack` (moved into `table` in Lua 5.2 but kept as a
  // global in Luau for backwards compat).
  unpack: {
    arity: -1,
    deprecated:
      "The global `unpack` is deprecated in Luau. Use `table.unpack(t)` instead.",
    fn: (story, args) => unpackImpl(story, args, "unpack"),
  },

  // ============================================================
  // Iteration: `next` + `pairs` + `ipairs`.
  //
  // `next(t, k)` is the primitive: pop the entry AFTER `k` in `t`'s
  // insertion order, return (k', v') as a multi-value. With `k == nil`
  // (or absent), return the FIRST entry. With `k` equal to the last
  // entry, return nil — the generic-for loop's nil-check terminates.
  //
  // `pairs(t)` and `ipairs(t)` return a `__builtin_iter`-shaped
  // ObjectValue that the runtime's CallValueAsFunction handler
  // recognizes (see `Story.ts`). Each invocation calls the matching
  // iterator implementation with the captured state and advances the
  // internal cursor stored on the ObjectValue itself.
  //
  // `pairs` walks ALL keys in insertion order; `ipairs` walks integer
  // keys 1..N stopping at the first gap (matches Luau).
  // ============================================================
  next: {
    arity: -1,
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
      // Keys are stored as strings in sparkdown's ObjectValue Map.
      // Numeric-looking keys (`"1"`, `"2"`, …) should round-trip back
      // to IntValue so iterating an array-style table yields the
      // original numeric indices.
      const keyValue: AbstractValue = /^-?\d+$/.test(nextKey)
        ? new IntValue(parseInt(nextKey, 10))
        : new StringValue(nextKey);
      return new MultiValue([keyValue, nextValue as AbstractValue]);
    },
  },
  // `pairs(t)` / `ipairs(t)` return Lua's full iterator-protocol
  // triple `(iterator, state, control)` so:
  //   - generic-for threads the REAL table + previous control value
  //     into each step (`__iter(__state, __ctrl)`), and
  //   - manually-invoked iterators work: `local inext = ipairs(t)`
  //     takes the first value (the iterator marker) and
  //     `inext({5,6,7}, 2)` returns `(3, 7)` (basic.luau line 230).
  // The marker still carries internal state as a fallback for call
  // sites that pass nil state (see stepBuiltinIterator).
  // Hidden instance constructor for `define`-declared classes
  // (emitted by the `new ClassName(args)` expression lowering —
  // never user-callable, the `__` prefix is reserved). Builds a
  // fresh table whose metatable `__index`es the class so property
  // and method reads fall through the inheritance chain (table-form
  // dispatch — plain map walks, no function-form metamethod
  // re-entry). Then:
  //   1. Copies `store`-marked property defaults INTO the instance
  //      (walking the chain root-most first so child overrides win).
  //      Store props are instance-owned from birth, so they always
  //      travel with the instance in save files; non-store
  //      properties stay on the class until written and reset to
  //      class defaults on load.
  //   2. Calls the class's `init` method (own or inherited) with
  //      the instance + the constructor's arguments, when defined.
  "__new": {
    arity: -1,
    fn: (story, args) => {
      const cls = args[0];
      if (!(cls instanceof ObjectValue)) {
        story.Error(
          `new: ${luauTypeOf(cls)} value is not a class (expected a \`define\`d class name)`,
        );
        return null;
      }
      const inst = new ObjectValue(new Map<string, AbstractValue>());
      const mtMap = new Map<string, AbstractValue>();
      mtMap.set("__index", cls);
      inst.metatable = new ObjectValue(mtMap);

      // Collect the inheritance chain (instance class first).
      const chain: ObjectValue[] = [];
      let cur: ObjectValue | null = cls;
      let guard = 0;
      while (cur instanceof ObjectValue && guard++ < 32) {
        chain.push(cur);
        const mt = cur.metatable;
        const idx =
          mt instanceof ObjectValue
            ? ((mt.value as Map<string, AbstractValue>)?.get("__index") ??
              null)
            : null;
        cur = idx instanceof ObjectValue ? idx : null;
      }

      // Copy store-marked defaults, root-most level first so a
      // child's redeclared default overwrites its parent's. Note
      // table-valued defaults copy by REFERENCE (Lua semantics —
      // shared across instances unless `init` replaces them).
      for (let i = chain.length - 1; i >= 0; i--) {
        const level = chain[i]!;
        const levelMap = level.value as Map<string, AbstractValue>;
        const storeList = levelMap?.get("__storeProps");
        if (!(storeList instanceof ObjectValue)) continue;
        for (const nameVal of (
          storeList.value as Map<string, AbstractValue>
        ).values()) {
          const propName = coerceString(nameVal);
          if (!propName) continue;
          const def = levelMap.get(propName);
          if (def != null) inst.value!.set(propName, def);
        }
      }

      // Constructor: nearest `init` up the chain, called with the
      // instance threaded as `self` plus the `new` call's args.
      for (const level of chain) {
        const init = (level.value as Map<string, AbstractValue>)?.get(
          "init",
        );
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
  // Hidden generic-for ENTRY adjustment (emitted by
  // lowerLuauGenericForLoop right after the (f, s, ctrl) init —
  // never user-callable, the `__` prefix is reserved). Implements
  // Luau's iterand protocol for `for vars in EXPR do`:
  //   - EXPR's metatable has `__iter` → call it with the iterand;
  //     its returns become the (f, s, ctrl) triple.
  //   - EXPR is a plain table (not a closure value, not a stdlib /
  //     builtin-iterator marker, no `__call`) → implicit `pairs`
  //     iteration (Luau's `for k, v in t do`).
  //   - anything else (functions, markers, callable tables) passes
  //     through unchanged — the step call dispatches them normally.
  "__adjust_iter": {
    arity: 3,
    fn: (story, [fRaw, s, c]) => {
      let f = fRaw;
      // Single-value adjustment of the iterand slot: a multi-return
      // takes its first value; a no-value (`__iter` that returned
      // nothing, or an empty multi-return) is nil — the step's call
      // then raises Lua's "attempt to call a nil value" (iter.luau
      // line 174).
      if (f instanceof MultiValue) f = f.values[0] ?? new NullValue();
      if (f != null && (f as any).constructor?.name === "Void") {
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
            // A multi-return arrives as ONE MultiValue element —
            // spread it across the (f, s, ctrl) triple. A no-value
            // return (Void) adjusts to nil so the step raises
            // "attempt to call a nil value".
            if (results.length === 1 && results[0] instanceof MultiValue) {
              results = (results[0] as MultiValue).values;
            }
            let r0 = results[0] ?? new NullValue();
            if ((r0 as any)?.constructor?.name === "Void") {
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
          // Plain table — Luau iterates it directly (generalized
          // pairs, consistent with __iter's absence).
          return [
            makeBuiltinIterator("pairs", f as ObjectValue),
            f as ObjectValue,
            new NullValue(),
          ];
        }
        return [f, s, c];
      }
      // Function values pass through; everything else can't be
      // iterated — `for x in 42 do` raises Luau's trappable
      // "attempt to iterate over a number value" (iter.luau line
      // 164). nil iterands fall through to the step's call-a-nil
      // error instead (an `__iter` that returned nothing must
      // report "attempt to call a nil value", line 174).
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

  // ============================================================
  // `os.*` — wall-clock helpers. Sparkdown's runtime has no
  // dedicated clock subsystem; these delegate to the host's
  // `Date.now()` / `performance.now()`. Results are NOT
  // deterministic across saves/restores — use only for content
  // that doesn't need to round-trip.
  // ============================================================
  "os.clock": {
    arity: 0,
    fn: () =>
      typeof performance !== "undefined" && performance.now
        ? performance.now() / 1000
        : Date.now() / 1000,
  },
  // `os.time([t])` — Unix timestamp. With no arg, current time. With
  // a table arg `{year, month, day [, hour, min, sec]}`, Luau (unlike
  // Lua 5.x's mktime) interprets the fields as **UTC** — that's how
  // `os.time({year=1970, month=1, day=1, hour=0, min=0, sec=0}) == 0`
  // holds exactly regardless of host timezone (datetime.luau line
  // 22). Out-of-range fields normalize arithmetically (JS Date.UTC
  // matches mktime's field normalization); times before the epoch
  // are unrepresentable and return nil. Defaults: `hour=12`,
  // `min=0`, `sec=0` — matching loslib's getfield defaults.
  "os.time": {
    arity: -1,
    fn: (story, args) => {
      if (args.length === 0 || args[0] == null || args[0] instanceof NullValue) {
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
      if (!Number.isFinite(ms) || ms < 0) return null; // pre-epoch → nil
      return Math.floor(ms / 1000);
    },
  },
  "os.difftime": { arity: 2, pure: true, fn: (_, [t2, t1]) => t2 - t1 },

  // `os.date([format [, time]])` — Lua/Luau strftime-style date
  // formatting. Three modes:
  //   - Format string starts with `*t` (UTC: `!*t`) — return a table
  //     with `year/month/day/hour/min/sec/wday/yday/isdst` fields.
  //   - Format starts with `!` — render the rest using UTC fields.
  //   - Otherwise — render using local fields.
  // Default format is "%c" (locale-equivalent date+time). Default
  // time is the current epoch second.
  //
  // We hardcode English month/weekday names — JS's `Intl` is locale-
  // dependent and not appropriate for a deterministic runtime.
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
      // Negative times are unrepresentable (gmtime fails) —
      // `os.date("", -1) == nil` (datetime.luau line 19).
      if (timeArg != null && timeArg < 0) return null;
      const epochMs = timeArg != null ? Math.trunc(timeArg) * 1000 : Date.now();
      let utc = false;
      if (fmt.startsWith("!")) {
        utc = true;
        fmt = fmt.slice(1);
      }
      const d = new Date(epochMs);
      const fields = utc ? getDateFieldsUTC(d) : getDateFieldsLocal(d);
      // Table form.
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
        // Real boolean — `type(D.isdst) == 'boolean'` (datetime.luau).
        map.set("isdst", new BoolValue(fields.isdst));
        return new ObjectValue(map);
      }
      return formatDateString(fmt, fields, story);
    },
  },

  // ============================================================
  // `utf8.*` — Unicode helpers. `char`/`len`/`codepoint` are the
  // most commonly-used. Pattern-iterator functions (`codes`,
  // `offset`) need first-class function values (deferred).
  // ============================================================
  "utf8.char": {
    arity: -1,
    fn: (story, args) => {
      // utfchar (lutf8lib.cpp): encode each codepoint to its UTF-8
      // BYTES (byte-string convention — each result char <= 0xFF).
      // Codepoints outside [0, 0x10FFFF] raise "value out of range".
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
  // `utf8.len(s [, i [, j]])` — number of UTF-8 code points in `s`
  // from byte position `i` (default 1) to byte position `j` (default
  // -1, end of string). Negative indices count from the end.
  // Sparkdown's JS strings are always valid Unicode (UTF-16), so the
  // "first invalid byte" error path Lua specifies never triggers.
  // `utf8.codepoint(s [, i [, j]])` — multi-return: codepoint
  // integers for each UTF-8 character whose starting byte lies in
  // `[i, j]` (1-indexed bytes, default `j = i`, default `i = 1`).
  // Sparkdown's JS strings are always valid Unicode, so the
  // "invalid UTF-8" error path Lua specifies never triggers.
  "utf8.codepoint": {
    arity: -1,
    fn: (story, args) => {
      // codepoint (lutf8lib.cpp): codepoints for all characters
      // STARTING in byte range [i, j]; decode failures raise.
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
    fn: (story, args) => {
      // utflen (lutf8lib.cpp): characters STARTING in byte range
      // [i, j]; on a malformed sequence returns (nil, position)
      // instead of raising.
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
  // `utf8.offset(s, n [, i])` — byte position where the n-th UTF-8
  // character (counting from byte position `i`) starts. `n` may be
  // negative (count backward) or zero (return the start of the
  // character containing byte `i`). Default `i` is 1 when n >= 0,
  // otherwise `#s + 1`. Returns `null` (nil) when out of range.
  "utf8.offset": {
    arity: -1,
    fn: (story, args) => {
      // byteoffset (lutf8lib.cpp): byte index where the n-th
      // character counting from position i starts; n == 0 finds the
      // start of the sequence CONTAINING byte i. nil when there's no
      // such character; raises for out-of-range i or a continuation-
      // byte start.
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
  // `utf8.codes(s)` — Lua 5.3+ / Luau. Returns a generic-for
  // iterator: each step yields `(byte_position, codepoint)` for the
  // next character in `s`. `byte_position` is 1-indexed and matches
  // the convention used by `utf8.codepoint` / `utf8.offset`.
  //
  // Internally builds a marker-keyed ObjectValue routed through
  // `stepBuiltinIterator` (same dispatch as `pairs` / `ipairs` /
  // `gmatch`). The cursor is the 0-indexed codepoint number;
  // advance is by codepoint, not byte.
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
  // `utf8.nfcnormalize(s)` / `utf8.nfdnormalize(s)` — Luau-only.
  // Unicode Normalization Form C / D. JS strings expose this directly
  // via `String.prototype.normalize`.
  "utf8.nfcnormalize": {
    arity: 1,
    fn: (_, [s]) => (coerceString(s) ?? "").normalize("NFC"),
  },
  "utf8.nfdnormalize": {
    arity: 1,
    fn: (_, [s]) => (coerceString(s) ?? "").normalize("NFD"),
  },

  // ============================================================
  // `debug.*` — call-stack introspection.
  // ============================================================
  //
  // Sparkdown doesn't track per-frame source lines (the runtime
  // works in path-space, not source-space), so `l`/`r` line info is
  // always -1. The `s`/`n` info is best-effort from the frame's
  // current pointer's container path.

  // `debug.traceback([message [, level]])` — Lua/Luau. Returns a
  // string dump of the running call stack, optionally prefixed by
  // `message`. The `level` arg is accepted for compatibility but
  // ignored (the inkjs CallStack already produces a complete
  // top-down dump).
  "debug.traceback": {
    arity: -1,
    fn: (story, args) => {
      const msg = args.length > 0 ? coerceString(args[0]) : null;
      const trace = story.state.callStack.callStackTrace;
      const header = msg != null && msg !== "" ? msg + "\nstack traceback:\n" : "stack traceback:\n";
      return header + trace;
    },
  },
  // `debug.info(level, options)` — Luau form. `level` is 1-indexed
  // (1 = the function that called `debug.info`). `options` is a
  // string of one-letter codes — for each, we push the requested
  // datum as a separate return value (multi-return):
  //   `s` → source path of the frame's container (or "?")
  //   `l` → -1 (line info not tracked)
  //   `n` → frame name (container path leaf), or ""
  //   `a` → 0 (arity not tracked)
  //   `f` → nil (no first-class function value for the frame)
  //   `r` → -1 (line-range not tracked)
  // Returns nil if `level` exceeds the call-stack depth.
  "debug.info": {
    arity: 2,
    fn: (story, [levelArg, optsArg]) => {
      const level = Math.floor(coerceNumber(levelArg) ?? 1);
      const opts = coerceString(optsArg) ?? "";
      const elements = story.state.callStack.elements;
      // Lua convention: level 1 is the caller of `debug.info`. The
      // current call sits at the top of the JS stack but we map
      // `level - 1` directly into the inkjs callstack (which is
      // ordered bottom-up). So level 1 = top of stack.
      const idx = elements.length - level;
      if (idx < 0 || idx >= elements.length) return new NullValue();
      const frame = elements[idx];
      const ptr = frame?.currentPointer;
      const container = ptr && !ptr.isNull ? ptr.container : null;
      const pathStr = container?.path?.toString() ?? "?";
      const name = pathStr.includes(".")
        ? pathStr.substring(pathStr.lastIndexOf(".") + 1)
        : pathStr;
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
            // Luau returns line-range as two values (first, last);
            // we don't have line tracking, so emit -1, -1.
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

  // `assert(v, [message], ...)` — Luau-style assertion. Raises a
  // runtime error when `v` is falsy; on success returns ALL its
  // arguments (`assert(1) == 1`, `select('#', assert(1,2,3)) == 3`).
  // Lua truthiness: only `nil` and `false` are falsy — `assert(0)`
  // and `assert("")` pass. Zero args raises "missing argument #1"
  // (Luau's exact message — no `to 'assert'` suffix).
  assert: {
    arity: -1,
    fn: (story, args) => {
      // Luau's assert raises through `luaL_error`, which prepends
      // the `chunkname:line: ` position prefix — unlike PUC Lua,
      // where a provided message object propagates verbatim. The
      // conformance suite strips that prefix with
      // `err:sub(err:find(": ") + 2)`, so it must be present.
      const raise = (raw: string) => {
        const message = story.errorMessageFormatter
          ? story.errorMessageFormatter(story, raw)
          : raw;
        // Throw via story.Error (matches Lua semantics — `assert`
        // raises a runtime error, which `pcall` can trap). Using
        // story.AddError instead would call ForceEnd which wipes
        // the call stack — fine for unhandled errors, but defeats
        // pcall's protection.
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

// Luau-style names that resolve to ink-runtime builtin names. These
// builtins have special handling in `FunctionCall.GenerateIntoContainer`
// (they emit dedicated ControlCommands rather than NativeFunctionCall
// dispatch) — the lowerer just needs to translate the source name to
// the ink name and FunctionCall does the rest.
//
// `count.*` exposes ink's narrative-flow builtins (read counts, turns
// elapsed, choice count) under a luau-style namespace that makes it
// clear the methods return *counts* rather than the things themselves.
// `count` is registered as a stdlib namespace in the grammar, so it's
// reserved as an identifier — syntax highlighting flags it as stdlib
// at the source level. `math.random` / `math.randomseed` are
// technically math operations but they mutate the runtime's random-
// state and can't be modelled as pure functions, so they live here too
// rather than as pure entries.
//
// `count.turns` is overloaded by arity:
//   - `count.turns()` (no args)       → `TURNS`        (total turns elapsed)
//   - `count.turns(-> target)` (1 arg) → `TURNS_SINCE`  (turns since target)
// Same conceptual operation, "turn counter against a reference point",
// disambiguated by whether a reference point was provided.
export const INK_BUILTIN_ALIASES: Record<
  string,
  Record<string, InkBuiltinAlias>
> = {
  count: {
    // `count.turns(-> target)` 1-arg form maps to `TURNS_SINCE`
    // (legacy per-function ControlCommand). The 0-arg form lives
    // in `STDLIB` as `"count.turns"`; the alias function returns
    // `null` for `argCount === 0` so `lookupStdLibBuiltin` falls
    // through to the STDLIB lookup. `count.visits(-> t)`
    // → `READ_COUNT` likewise stays legacy because of compile-time
    // container-counting setup in `FunctionCall.ResolveReferences`
    // that doesn't fit the generic dispatcher.
    turns: (argCount) => (argCount === 1 ? "TURNS_SINCE" : null),
    visits: "READ_COUNT",
    // `count.visited(-> t)` — boolean shorthand for
    // `count.visits(-> t) > 0`. Same READ_COUNT machinery (the alias
    // triggers the compile-time container-counting setup); the
    // lowerer wraps the call in `> 0` so it yields a genuine boolean
    // that behaves identically under Lua truthiness and in ink-style
    // narrative conditions. The idiomatic "has the reader been
    // here?" check now that bare read counts are no longer falsy-at-0
    // in Luau code.
    visited: "READ_COUNT",
  },
};

// Returns the runtime builtin name for a `<receiver>.<method>(args)`
// call if one is registered, or `null` otherwise. Used by the lowerer to
// decide whether to translate a method-call into a direct builtin call.
//
// For STDLIB entries, the returned name is the dotted full name
// (`"math.floor"`) which `NativeFunctionCall` dispatches on. For
// INK_BUILTIN_ALIASES entries, it's the ink name (`"TURNS"`) which
// `FunctionCall.GenerateIntoContainer` dispatches on.
//
// `argCount` lets a single Luau-style method name resolve to different
// ink builtins based on arity (see `count.turns` in
// `INK_BUILTIN_ALIASES`). Unified STDLIB entries don't consult
// `argCount` — pure entries enforce their arity via NativeFunctionCall,
// state-aware entries via the registered `arity` field.
export function lookupStdLibBuiltin(
  receiverName: string,
  methodName: string,
  argCount: number,
): string | null {
  // Check INK_BUILTIN_ALIASES first — arity-overloaded entries like
  // `count.turns` can return null for some arg counts, letting the
  // unified STDLIB pick those up below. (`count.turns(0)` falls
  // through to STDLIB["count.turns"]; `count.turns(1, t)` resolves
  // to "TURNS_SINCE" here.)
  const alias = INK_BUILTIN_ALIASES[receiverName]?.[methodName];
  if (alias != null) {
    const resolved = typeof alias === "string" ? alias : alias(argCount);
    if (resolved !== null) return resolved;
  }
  // Unified registry: pure-numeric and state-aware entries alike
  // are keyed by dotted full name. The compiler returns the same
  // name as the FunctionCall's; pure entries dispatch through
  // NativeFunctionCall (auto-registered at engine init), state-aware
  // entries through `RunStdLibFunction`.
  const fullName = `${receiverName}.${methodName}`;
  if (STDLIB[fullName] != null) {
    return fullName;
  }
  return null;
}

// Resolves a bare (unnamespaced) source-level call to its stdlib
// builtin name, or `null` if the name isn't registered. Today the
// resolved name equals the source name — `assert` stays `assert`
// end-to-end. Used by the lowerer to ask "is this a registered
// global stdlib?" without importing the full registry object.
export function lookupGlobalStdLibBuiltin(
  name: string,
  _argCount: number,
): string | null {
  return STDLIB[name] != null ? name : null;
}

// Stdlib constants — identifiers that evaluate to a fixed value at
// compile time. The lowerer (`lowerSimpleAccessPath`) checks the
// dotted name of an access path against this table and emits the
// value directly (as a `NumberExpression` / `StringExpression`)
// instead of a `VariableReference`. No runtime dispatch needed —
// the value is baked into the compiled IR. Keys are dotted full
// names (`"math.pi"`, `"math.huge"`, `"_VERSION"`).
export const STDLIB_CONSTANTS: Record<string, number | string | boolean> = {
  // Standard Luau math constants.
  "math.pi": Math.PI,
  "math.huge": Infinity,
  // Luau 0.6+ named constants (math.luau "math constants" section).
  "math.tau": Math.PI * 2,
  "math.sqrt2": Math.SQRT2,
  "math.e": Math.E,
  "math.phi": (1 + Math.sqrt(5)) / 2,
  "math.nan": NaN,

  // UTF-8 helper constant — Luau's UTF8PATT (lutf8lib.cpp): a
  // Lua-pattern matching one UTF-8 byte sequence. Used with
  // string.gmatch over byte strings (`for c in s:gmatch(
  // utf8.charpattern)`); the lead-byte class tops out at \xF4
  // (sequences above U+10FFFF are invalid).
  "utf8.charpattern": "[\0-\x7F\xC2-\xF4][\x80-\xBF]*",

  // Globals (non-namespaced) — single-identifier access.
  // `_VERSION` is the language version string; sparkdown reports
  // "Luau" since it aspires to Luau-superset semantics.
  _VERSION: "Luau",
};

export function lookupStdLibConstant(
  name: string,
): number | string | boolean | undefined {
  return STDLIB_CONSTANTS[name];
}

// Direct registry lookup for state-aware builtins. Returns the
// registered entry (`{arity, fn}`) or `null` if the name isn't a
// state-aware entry. Pure entries are intentionally excluded — they
// dispatch through `NativeFunctionCall` and the generic
// `RunStdLibFunction` runtime handler should never receive them.
// Used by `FunctionCall.isStateAwareStdLib` (compile-time) and the
// generic dispatcher in Story.ts (runtime) to route only the non-pure
// entries through the generic path.
export function lookupStateAwareStdLib(name: string): StdLibEntry | null {
  const entry = STDLIB[name];
  if (entry == null || entry.pure) return null;
  return entry;
}

// True when `name` is a known stdlib function (state-aware or pure).
// Used by the runtime variable-lookup fallback to push a callable
// sentinel for `type(type) == 'function'`-style references.
export function isStdLibFunctionName(name: string): boolean {
  return STDLIB[name] != null;
}

// True when `name` is a stdlib NAMESPACE root (`math`, `string`,
// `table`, ...) — i.e. at least one registered entry lives under
// `name + "."`. Used by the runtime dotted-read error path to
// distinguish `math.idontexist` (a valid read of a missing member of
// an existing table → nil) from `idontexist.a` (indexing nil →
// "attempt to index a nil value").
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

// True when `name` is a registered PURE stdlib op over numbers
// (`math.abs`, `math.floor`, ...). Used by NativeFunctionCall.Call to
// apply Lua's argument semantics: numeric strings coerce, and
// missing / wrong-typed arguments raise Lua-formatted, pcall-trappable
// errors ("missing argument #1 to 'abs'" / "invalid argument #1 to
// 'abs'").
export function isPureNumberStdLibOp(name: string): boolean {
  const entry = STDLIB[name];
  if (!entry) return false;
  const types = pureStdLibTypes(entry);
  return !!types && types.length === 1 && types[0] === "number";
}

// Lookup any stdlib entry by name regardless of pure / state-aware
// classification. Used by runtime call-on-marker dispatch (variable-
// divert path in Story.ts) to invoke a `__stdlib_fn`-tagged ObjectValue
// — the call site doesn't know whether the wrapped name is pure or
// state-aware, just that it's a Luau stdlib callable. Returns null if
// `name` isn't registered.
export function lookupAnyStdLib(name: string): StdLibEntry | null {
  return STDLIB[name] ?? null;
}

// Normalize an entry's `pure` field to a concrete list of operand
// types. `pure: true` is shorthand for the classic numeric type.
// Returns `null` for state-aware entries (so callers can use a single
// nullish check).
export function pureStdLibTypes(entry: StdLibEntry): PureStdLibType[] | null {
  if (entry.pure === true) return ["number"];
  if (Array.isArray(entry.pure) && entry.pure.length > 0) return entry.pure;
  return null;
}

// PURE entries' `fn`s receive RAW JS values (numbers/strings) — when
// dispatched as NativeFunctionCalls the engine's type coercion has
// already unwrapped them. The first-class marker paths in Story.ts
// (`pcall(math.abs, -5)`, `call(math.max, t)` via a stored
// `__stdlib_fn` value) pop AbstractValues off the eval stack instead,
// so they must unwrap before invoking a pure `fn` — `Math.abs(IntValue)`
// is NaN and `IntValue > -Infinity` compares an object. Numeric
// strings coerce per Lua (`math.abs('-5')`). State-aware entries take
// the wrapped values and are returned unchanged.
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
        // Pure NUMBER entries reject non-coercible args with Lua's
        // trappable message — `pcall(bit32.band, {})` must be false
        // (bitwise.luau lines 128-132). Only when the caller passes
        // `story` (the first-class marker dispatch paths); the
        // static NativeFunctionCall path has its own validation.
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

// If `name` resolves to a stdlib entry that's marked `deprecated`,
// returns the deprecation message; otherwise `null`. Used by the
// lowerer to emit Information-severity LSP diagnostics with
// `DiagnosticTag.Deprecated` at deprecated-stdlib call sites. The
// runtime still dispatches the call — the diagnostic is purely an
// editor-side hint.
export function lookupStdLibDeprecation(name: string): string | null {
  const entry = STDLIB[name];
  return entry?.deprecated ?? null;
}

// Returns the pure entries paired with the operand-type list each
// should be registered for. Used by
// `NativeFunctionCall.GenerateNativeFunctionsIfNecessary` at engine
// init to register each pure entry under every type it accepts.
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
