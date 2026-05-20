import { getPluralCategory } from "./PluralRules";
import { PRNG } from "./PRNG";
import {
  ObjectValue,
  IntValue,
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
  if (v != null && typeof v === "object" && "value" in v) {
    const raw = (v as any).value;
    if (typeof raw === "number") return raw;
  }
  return null;
}

/** Pull a JS string out of a `StringValue`, or accept raw. */
export function coerceString(v: any): string | null {
  if (typeof v === "string") return v;
  if (v != null && typeof v === "object" && "value" in v) {
    const raw = (v as any).value;
    if (typeof raw === "string") return raw;
  }
  return null;
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
    const raw = (v as any).value;
    if (raw == null) return "nil";
    if (typeof raw === "number") return "number";
    if (typeof raw === "string") return "string";
    if (typeof raw === "boolean") return "boolean";
    if (raw instanceof Map || typeof raw === "object") return "table";
  }
  if (typeof v === "number") return "number";
  if (typeof v === "string") return "string";
  if (typeof v === "boolean") return "boolean";
  return "userdata";
}

/**
 * Sparkdown truthiness check. Returns `false` for: `nil`/`null`/
 * `undefined`, JS `false`, numeric `0`, empty string `""`, `Void`
 * instances, and any wrapped Value whose `.value` is one of the
 * above. Used by `assert`, `if`, etc.
 *
 * Note: differs from Luau, where `0` and `""` are truthy. Documented
 * divergence in DIVERGENCES.md.
 */
export function isTruthy(v: any): boolean {
  if (v == null) return false;
  if (v === false || v === 0 || v === "") return false;
  if (typeof v === "object" && "value" in v) {
    const raw = (v as any).value;
    if (raw == null || raw === false || raw === 0 || raw === "") return false;
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
): "string" | "table" | "error" {
  if (repl == null) {
    story.Error("string.gsub: replacement argument is required");
    return "error";
  }
  if (coerceString(repl) != null || coerceNumber(repl) != null) {
    return "string";
  }
  if (repl instanceof ObjectValue) {
    const map = repl.value;
    if (map instanceof Map && map.has("__closure_fn")) {
      story.Error(
        "string.gsub with a function replacement is not yet supported. (Phase 5 — blocked on stdlib→Luau callback dispatch.)",
      );
      return "error";
    }
    return "table";
  }
  // Anonymous functions without upvalues / bare knot names lower to a
  // DivertTargetValue (not closure-wrapped). Match the function-form
  // error path so authors get the right hint regardless of which
  // function-value shape they pass.
  const ctorName = repl?.constructor?.name;
  if (
    ctorName === "DivertTargetValue" ||
    ctorName === "VariablePointerValue"
  ) {
    story.Error(
      "string.gsub with a function replacement is not yet supported. (Phase 5 — blocked on stdlib→Luau callback dispatch.)",
    );
    return "error";
  }
  story.Error(
    "string.gsub: replacement must be a string, number, table, or function",
  );
  return "error";
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
  const SPEC =
    /%([-+ 0#]*)(\d+)?(?:\.(\d+))?([diouxXeEfgGcsq%])/g;
  let out = "";
  let lastIndex = 0;
  let argIdx = 0;
  let match: RegExpExecArray | null;
  SPEC.lastIndex = 0;
  while ((match = SPEC.exec(fmt)) !== null) {
    out += fmt.slice(lastIndex, match.index);
    lastIndex = SPEC.lastIndex;
    const [, flagsStr, widthStr, precisionStr, type] = match;
    if (type === "%") {
      out += "%";
      continue;
    }
    const flags = new Set((flagsStr ?? "").split(""));
    const width = widthStr ? parseInt(widthStr, 10) : 0;
    const precision = precisionStr != null ? parseInt(precisionStr, 10) : null;
    const arg = args[argIdx++];
    let formatted: string;
    try {
      formatted = formatOneSpec(arg, type!, flags, precision);
    } catch (e) {
      story.Error(
        `string.format: ${(e as Error).message ?? String(e)} (for "%${type}")`,
      );
      formatted = "";
    }
    if (width > formatted.length) {
      if (flags.has("-")) {
        formatted = formatted.padEnd(width, " ");
      } else if (flags.has("0") && /[diouxXeEfgG]/.test(type!)) {
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
  out += fmt.slice(lastIndex);
  return out;
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
      const n = numericArg();
      const u = (Math.trunc(n) >>> 0).toString();
      return precision !== null ? u.padStart(precision, "0") : u;
    }
    case "o": {
      const n = numericArg();
      let body = (Math.trunc(n) >>> 0).toString(8);
      if (precision !== null) body = body.padStart(precision, "0");
      if (flags.has("#") && !body.startsWith("0")) body = "0" + body;
      return body;
    }
    case "x":
    case "X": {
      const n = numericArg();
      let body = (Math.trunc(n) >>> 0).toString(16);
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
      const body = Math.abs(n).toFixed(p);
      return (n < 0 ? "-" : signPrefix(n)) + body;
    }
    case "g":
    case "G": {
      const n = numericArg();
      const p = precision ?? 6;
      let body = Math.abs(n).toPrecision(Math.max(1, p));
      // toPrecision can return scientific notation; normalize "e" case.
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
          if (c === '"') return '\\"';
          if (c === "\\") return "\\\\";
          if (c === "\n") return "\\n";
          if (c === "\r") return "\\r";
          if (c === "\0") return "\\0";
          return c;
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
  const out: any[] = [];
  for (let k = i; k <= j; k++) {
    out.push(map.get(String(k)) ?? null);
  }
  return out;
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
) => { values: AbstractValue[]; nextCursor: AbstractValue } | null;

const BUILTIN_ITERATORS: Record<string, IterStep> = {
  // `pairs(t)` — visit every key in insertion order. Cursor is the
  // previous key (string in the underlying Map). `nil` cursor →
  // start at the first entry.
  pairs: (state, cursor) => {
    if (!(state instanceof ObjectValue)) return null;
    const map = state.value as Map<string, AbstractValue> | null;
    if (!map) return null;
    const keys = Array.from(map.keys());
    let idx: number;
    if (
      cursor == null ||
      cursor instanceof NullValue ||
      (cursor as any).value === null
    ) {
      idx = 0;
    } else {
      const cstr =
        typeof (cursor as any).value === "string"
          ? (cursor as any).value
          : String((cursor as any).value);
      const i = keys.indexOf(cstr);
      idx = i < 0 ? keys.length : i + 1;
    }
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
    return { values: [new IntValue(i), v], nextCursor: new IntValue(i) };
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
 * Runtime entry point: advance the iterator stored on `iter` by one
 * step. Returns the yielded values as a `MultiValue` (or the single
 * value directly when there's only one), or a `NullValue` when
 * iteration ends. Called from `Story.ts`'s `CallValueAsFunction`
 * handler.
 */
export function stepBuiltinIterator(iter: ObjectValue): AbstractValue {
  const map = iter.value as Map<string, AbstractValue> | null;
  if (!map) return new NullValue();
  const tagVal = map.get(BUILTIN_ITER_TAG);
  const name = (tagVal as Value<string> | undefined)?.value;
  if (!name) return new NullValue();
  const step = BUILTIN_ITERATORS[name];
  if (!step) return new NullValue();
  const state = map.get(BUILTIN_ITER_STATE) as AbstractValue | undefined;
  if (state == null) return new NullValue();
  const cursor = (map.get(BUILTIN_ITER_CURSOR) ?? null) as AbstractValue | null;
  const result = step(state, cursor);
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
  "math.max": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) => {
      let m = -Infinity;
      for (const n of args) if (n > m) m = n;
      return m;
    },
  },
  "math.min": {
    arity: -1,
    pure: true,
    fn: (_, args: number[]) => {
      let m = Infinity;
      for (const n of args) if (n < m) m = n;
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
  "math.round": { arity: 1, pure: true, fn: (_, [v]) => Math.round(v) },
  "math.sign": { arity: 1, pure: true, fn: (_, [v]) => Math.sign(v) },
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

  // `math.lerp(a, b, t)` — Luau 0.6+. Linear interpolation between
  // `a` and `b` parameterised by `t` (not clamped — `t` outside [0,1]
  // extrapolates).
  "math.lerp": {
    arity: 3,
    pure: true,
    fn: (_, [a, b, t]) => a + (b - a) * t,
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
  // their JS string form.
  tostring: {
    arity: 1,
    fn: (_, [v]) => {
      if (v == null) return "nil";
      if (typeof v === "object" && "value" in v) {
        const raw = (v as any).value;
        if (raw == null) return "nil";
        if (typeof raw === "boolean") return raw ? "true" : "false";
        return String(raw);
      }
      if (typeof v === "boolean") return v ? "true" : "false";
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
      const parsed =
        baseVal !== null ? parseInt(s, baseVal) : Number(s);
      return Number.isFinite(parsed) ? parsed : null;
    },
  },

  // `type(v)` — Lua-style type-of string: `"nil"` / `"number"` /
  // `"string"` / `"boolean"` / `"table"` / `"function"` / `"userdata"`.
  // Approximated via the runtime Value subclass's `.value` shape.
  type: {
    arity: 1,
    fn: (_, [v]) => luauTypeOf(v),
  },

  // `typeof(v)` — Luau extension: `type(v)` for primitives, otherwise
  // the userdata typeName. Sparkdown doesn't have userdata yet, so
  // it behaves identically to `type` for now.
  typeof: {
    arity: 1,
    fn: (_, [v]) => luauTypeOf(v),
  },

  // `error(message [, level])` — raise a runtime error. The `level`
  // arg controls the source location attribution in real Lua/Luau;
  // sparkdown ignores it (we don't track call-frame depth in error
  // messages). Force-ends the story like `assert`'s failure path.
  error: {
    arity: 1,
    fn: (story, [msg]) => {
      const message = coerceString(msg) ?? "error";
      story.AddError(message);
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
      const n = coerceNumber(args[0]);
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
    fn: (_, args: number[]) => String.fromCharCode(...args),
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
      if (args.length < 3) return s.repeat(n);
      const sep = coerceString(args[2]) ?? "";
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
          const tableMap = (replArg as ObjectValue).value as Map<
            string,
            AbstractValue
          >;
          const lookup = tableMap.get(lookupKey);
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

  // ============================================================
  // `bit32.*` — 32-bit integer ops. JS bitwise operators already
  // operate on signed 32-bit ints; `>>> 0` coerces back to unsigned
  // for Lua-style unsigned semantics.
  // ============================================================
  "bit32.bnot": { arity: 1, pure: true, fn: (_, [v]) => (~v) >>> 0 },
  "bit32.lshift": {
    arity: 2,
    pure: true,
    fn: (_, [v, n]) => (v << n) >>> 0,
  },
  "bit32.rshift": {
    arity: 2,
    pure: true,
    fn: (_, [v, n]) => v >>> n,
  },
  "bit32.arshift": {
    arity: 2,
    pure: true,
    fn: (_, [v, n]) => (v >> n) >>> 0,
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
      const field = args[1] ?? 0;
      const width = args.length > 2 ? (args[2] ?? 1) : 1;
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
      const field = args[2] ?? 0;
      const width = args.length > 3 ? (args[3] ?? 1) : 1;
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
        if (/^[1-9]\d*$/.test(k)) {
          const n = parseInt(k, 10);
          if (n > max) max = n;
        }
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
      const sep = args.length > 1 ? (coerceString(args[1]) ?? "") : "";
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
      const init =
        args.length > 2 ? Math.max(1, coerceNumber(args[2]) ?? 1) : 1;
      let k = init;
      while (map.has(String(k))) {
        const v = map.get(String(k));
        const raw =
          v != null && typeof v === "object" && "value" in v
            ? (v as any).value
            : v;
        if (raw === targetRaw) return k;
        k++;
      }
      return null;
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
      } else if (args.length >= 3) {
        const p = coerceNumber(args[1]);
        if (p === null || !Number.isInteger(p) || p < 1 || p > len + 1) {
          story.Error("table.insert: position out of bounds");
          return undefined;
        }
        pos = p;
        value = args[2];
        for (let k = len; k >= pos; k--) {
          const existing = map.get(String(k));
          if (existing !== undefined) {
            map.set(String(k + 1), existing);
          }
        }
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
    fn: (story, args) => {
      const t = args[0];
      if (!(t instanceof ObjectValue)) {
        story.Error("table.sort: first argument must be a table");
        return undefined;
      }
      if (t.isFrozen) {
        story.Error("table.sort: cannot mutate a frozen table");
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
      const comp = args.length > 1 ? args[1] : null;
      const defaultLess = (a: AbstractValue, b: AbstractValue): boolean => {
        const av = (a as any)?.value;
        const bv = (b as any)?.value;
        if (typeof av === "number" && typeof bv === "number") return av < bv;
        if (typeof av === "string" && typeof bv === "string") return av < bv;
        story.Error(
          "table.sort: attempt to compare incompatible values; supply a comparator",
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
    fn: (story, [t]) => {
      if (!(t instanceof ObjectValue)) {
        story.Error("table.clear: argument must be a table");
        return undefined;
      }
      if (t.isFrozen) {
        story.Error("table.clear: cannot mutate a frozen table");
        return undefined;
      }
      t.value!.clear();
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
      const next = new Map<string, AbstractValue>();
      for (const [k, v] of t.value!) next.set(k, v);
      return new ObjectValue(next);
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
      }
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
  "table.move": {
    arity: -1,
    fn: (story, args) => {
      if (args.length < 4) {
        story.Error("table.move: requires at least 4 arguments");
        return null;
      }
      if (!(args[0] instanceof ObjectValue)) {
        story.Error("table.move: first argument must be a table");
        return null;
      }
      const a1 = args[0];
      const f = coerceNumber(args[1]);
      const e = coerceNumber(args[2]);
      const tPos = coerceNumber(args[3]);
      if (f === null || e === null || tPos === null) {
        story.Error("table.move: f, e, t must be numbers");
        return null;
      }
      const a2 =
        args.length > 4 && args[4] instanceof ObjectValue ? args[4] : a1;
      if (a2.isFrozen) {
        story.Error("table.move: destination table is frozen");
        return null;
      }
      const src = a1.value!;
      const dst = a2.value!;
      if (e < f) return a2;
      if (tPos > f && src === dst) {
        for (let i = e; i >= f; i--) {
          const v = src.get(String(i));
          if (v !== undefined) dst.set(String(tPos + (i - f)), v);
        }
      } else {
        for (let i = f; i <= e; i++) {
          const v = src.get(String(i));
          if (v !== undefined) dst.set(String(tPos + (i - f)), v);
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
      return makeBuiltinIterator("pairs", t as ObjectValue);
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
      return makeBuiltinIterator("ipairs", t as ObjectValue);
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
  // a table arg `{year, month, day [, hour, min, sec]}`, treat the
  // fields as **local time** (matches Lua/Luau) and convert to a
  // Unix timestamp. `month` is 1-indexed per Lua (JS Date is 0-indexed,
  // so we subtract 1 when handing off). Defaults: `hour=12`, `min=0`,
  // `sec=0` — matching Lua's `os.time` documentation.
  "os.time": {
    arity: -1,
    fn: (story, args) => {
      if (args.length === 0 || args[0] == null) {
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
        return v == null ? null : coerceNumber(v);
      };
      const year = field("year");
      const month = field("month");
      const day = field("day");
      if (year === null || month === null || day === null) {
        story.Error("os.time: table must have year, month, day fields");
        return 0;
      }
      const hour = field("hour") ?? 12;
      const min = field("min") ?? 0;
      const sec = field("sec") ?? 0;
      const d = new Date(year, month - 1, day, hour, min, sec);
      return Math.floor(d.getTime() / 1000);
    },
  },
  "os.difftime": { arity: 2, pure: true, fn: (_, [t2, t1]) => t2 - t1 },

  // ============================================================
  // `utf8.*` — Unicode helpers. `char`/`len`/`codepoint` are the
  // most commonly-used. Pattern-iterator functions (`codes`,
  // `offset`) need first-class function values (deferred).
  // ============================================================
  "utf8.char": {
    arity: -1,
    fn: (_, args) => {
      // Lua's utf8.char(...) takes codepoint integers and returns a
      // single string. JS handles supplementary planes via
      // String.fromCodePoint (since ES2015).
      const codepoints: number[] = [];
      for (const v of args) {
        const n = coerceNumber(v);
        if (n === null) continue;
        codepoints.push(n);
      }
      return String.fromCodePoint(...codepoints);
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
      const s = coerceString(args[0]) ?? "";
      const [cpOffsets, totalBytes] = utf8CodepointOffsets(s);
      const iArg = args.length > 1 ? coerceNumber(args[1]) : 1;
      if (iArg === null) {
        story.Error("utf8.codepoint: position must be a number");
        return [];
      }
      const i = iArg;
      const j = args.length > 2 ? (coerceNumber(args[2]) ?? i) : i;
      if (i < 1 || i > totalBytes) {
        story.Error("utf8.codepoint: position out of bounds");
        return [];
      }
      const codepoints: number[] = [];
      let idx = 0;
      for (const cp of s) {
        const offset = cpOffsets[idx]!;
        if (offset >= i - 1 && offset <= j - 1) {
          codepoints.push(cp.codePointAt(0)!);
        }
        idx++;
      }
      return codepoints;
    },
  },
  "utf8.len": {
    arity: -1,
    fn: (story, args) => {
      const str = coerceString(args[0]) ?? "";
      const [cpOffsets, totalBytes] = utf8CodepointOffsets(str);
      let i = args.length > 1 ? (coerceNumber(args[1]) ?? 1) : 1;
      let j = args.length > 2 ? (coerceNumber(args[2]) ?? -1) : -1;
      if (i < 0) i = totalBytes + 1 + i;
      if (j < 0) j = totalBytes + 1 + j;
      if (i < 1) i = 1;
      if (j > totalBytes) j = totalBytes;
      if (i > totalBytes + 1) {
        story.Error("utf8.len: starting position out of bounds");
        return null;
      }
      let count = 0;
      // `cpOffsets` has one entry per code point plus a terminal offset.
      for (let k = 0; k < cpOffsets.length - 1; k++) {
        if (cpOffsets[k] >= i - 1 && cpOffsets[k] <= j - 1) count++;
      }
      return count;
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
      const s = coerceString(args[0]) ?? "";
      const nArg = coerceNumber(args[1]);
      if (nArg === null) {
        story.Error("utf8.offset: second argument must be a number");
        return null;
      }
      const n = Math.trunc(nArg);
      const [cpOffsets, totalBytes] = utf8CodepointOffsets(s);
      const defaultI = n >= 0 ? 1 : totalBytes + 1;
      let iArg = args.length > 2 ? (coerceNumber(args[2]) ?? defaultI) : defaultI;
      let i = Math.trunc(iArg);
      if (i < 0) i = totalBytes + 1 + i;
      if (i < 1 || i > totalBytes + 1) {
        story.Error("utf8.offset: position out of bounds");
        return null;
      }
      const byteI = i - 1;
      if (n === 0) {
        // Return position (1-based) of the character whose encoding
        // contains byte `byteI`. Walk forward through code-point
        // boundaries until we'd pass it.
        let result = 0;
        for (const off of cpOffsets) {
          if (off > byteI) break;
          result = off;
        }
        return result + 1;
      }
      // Locate the code-point boundary at `byteI`. `i` is required
      // to sit on a boundary (or at the one-past-end position) for
      // n != 0.
      let cpIdx = -1;
      for (let k = 0; k < cpOffsets.length; k++) {
        if (cpOffsets[k] === byteI) {
          cpIdx = k;
          break;
        }
      }
      if (cpIdx === -1) {
        story.Error("utf8.offset: position is not at a character boundary");
        return null;
      }
      // n=1 → current boundary; n=2 → next; n=-1 → previous; etc.
      const targetIdx = n > 0 ? cpIdx + n - 1 : cpIdx + n;
      if (targetIdx < 0 || targetIdx >= cpOffsets.length) return null;
      return cpOffsets[targetIdx] + 1;
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

  // `assert(cond [, message])` — Luau-style assertion. Raises a
  // runtime error via `story.AddError(message)` when `cond` is
  // falsy. Sparkdown truthiness: `nil` / `0` / `false` / `""` are
  // falsy (documented divergence from Luau where `0` is truthy —
  // see DIVERGENCES.md).
  assert: {
    arity: 2,
    fn: (story, [cond, msg]) => {
      if (!isTruthy(cond)) {
        const message = coerceString(msg) ?? "assertion failed";
        story.AddError(message);
      }
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

  // UTF-8 helper constant. Lua's `utf8.charpattern` is a Lua-pattern
  // that matches a single UTF-8 character: `[\0-\x7F\xC2-\xFD][\x80-\xBF]*`.
  // Sparkdown doesn't have Lua-pattern matching yet, but the string
  // constant itself is accessible — useful for code that introspects
  // the value or for forward-compat with future pattern support.
  "utf8.charpattern": "[\0-\x7F\xC2-\xFD][\x80-\xBF]*",

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

// Normalize an entry's `pure` field to a concrete list of operand
// types. `pure: true` is shorthand for the classic numeric type.
// Returns `null` for state-aware entries (so callers can use a single
// nullish check).
export function pureStdLibTypes(entry: StdLibEntry): PureStdLibType[] | null {
  if (entry.pure === true) return ["number"];
  if (Array.isArray(entry.pure) && entry.pure.length > 0) return entry.pure;
  return null;
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
