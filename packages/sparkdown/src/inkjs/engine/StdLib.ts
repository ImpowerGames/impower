import { getPluralCategory } from "./PluralRules";

// Sparkdown's Luau-standard-library bridge. Three tables drive everything:
//
//   - `NAMESPACED_STDLIB` — pure numeric JS functions (`math.floor`,
//     `math.cos`, ...). Adding a method here auto-registers it with
//     `NativeFunctionCall` under its dotted full name, and the lowerer
//     picks it up via `lookupStdLibBuiltin`.
//
//   - `INK_BUILTIN_ALIASES` — Luau-style names that *alias* an existing
//     ink runtime builtin (e.g. `story.turns` → `TURNS`,
//     `math.random` → `RANDOM`). These call into ControlCommand-backed
//     paths in `FunctionCall.ts` rather than `NativeFunctionCall`, so
//     they don't get auto-registered — only the *name mapping* matters,
//     and `FunctionCall.GenerateIntoContainer` dispatches on the
//     resolved ink name.
//
//   - `METHOD_DISPATCH` (in `MethodDispatch.ts`) — builtin method-call
//     receivers for `obj:method(args)`. The lowerer prefixes method
//     names with `__method_` and emits a normal `FunctionCall`;
//     `NativeFunctionCall.Call` recognizes the prefix and routes through
//     `callBuiltinMethod`. These are *variadic* (`numberOfParameters` is
//     `VARIADIC_ARITY` = -1) and bypass the operator-style type coercion
//     in favor of receiver-type branching inside each impl.
//
// The first two tables feed `lookupStdLibBuiltin` — the compiler's
// call-site mapper checks both, so source like `story.turns()` or
// `math.floor(x)` works regardless of which one the entry lives in. The
// third feeds the lowerer's separate method-name check.

export type NumericUnary = (v: number) => number;
export type NumericBinary = (a: number, b: number) => number;
export type StdLibFn = NumericUnary | NumericBinary;

// State-aware stdlib function. Takes the running `story` (typed as
// `any` here to avoid a circular import with `Story.ts`) and an
// array of popped eval-stack values, and may push a return value
// back onto the stack. Used for global Luau builtins that need
// access to runtime state — `assert` calls `story.AddError`,
// `plural.category` reads `lang.current` from `state.variablesState`,
// etc. — and therefore can't live in the pure-numeric `NAMESPACED_STDLIB` table.
export type StateAwareStdLibFn = (
  story: any,
  args: any[],
) => any | undefined;

export interface StateAwareStdLibEntry {
  /** Number of stack values to pop before calling `fn`. */
  arity: number;
  /**
   * Implementation. Receives popped args in source order (arg 0 first,
   * arg 1 second, …) — the runtime handler reverses the pop order so
   * implementations don't have to think about stack direction. May
   * return a value to push back onto the eval stack, or `undefined`
   * for void/no-return semantics.
   */
  fn: StateAwareStdLibFn;
}

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

// Re-export the method-dispatch surface so external callers
// (compiler, runtime engine) see one entry point. The actual table
// and helpers live in `MethodDispatch.ts` to keep this file small.
export {
  METHOD_DISPATCH,
  METHOD_PREFIX,
  callBuiltinMethod,
  isBuiltinMethod,
} from "./MethodDispatch";

// Namespaced pure-numeric functions (`math.floor`, `math.cos`, ...).
// Adding a new entry here auto-registers it with `NativeFunctionCall`
// at engine init. Use this table only for functions that:
//   - Live under a namespace (`math.*`, future `bit32.*`, etc.)
//   - Are pure: no story access, no side effects
//   - Take + return numbers (the arity is inferred from `fn.length`)
// For state-aware globals (`assert`, `error`, `print`, ...) use
// `GLOBAL_STDLIB` below. For namespaced functions that need
// story access (`math.random` reads RNG state), use `GLOBAL_STDLIB`
// with the dotted full name as the key.
export const NAMESPACED_STDLIB: Record<string, Record<string, StdLibFn>> = {
  math: {
    abs: (v) => Math.abs(v),
    ceil: (v) => Math.ceil(v),
    cos: (v) => Math.cos(v),
    exp: (v) => Math.exp(v),
    floor: (v) => Math.floor(v),
    log: (v) => Math.log(v),
    max: (a, b) => Math.max(a, b),
    min: (a, b) => Math.min(a, b),
    pow: (a, b) => Math.pow(a, b),
    sin: (v) => Math.sin(v),
    sqrt: (v) => Math.sqrt(v),
    tan: (v) => Math.tan(v),
  },
};

// An alias entry resolves a Luau-style source name to an ink-runtime
// builtin name. Most entries are a single fixed string. Some methods
// dispatch on arg count (e.g. `story.turns()` → `TURNS`,
// `story.turns(-> t)` → `TURNS_SINCE`) — for those, the entry is a
// function that takes the call's arg count and returns the resolved
// name (or `null` if the arity isn't supported).
export type InkBuiltinAlias = string | ((argCount: number) => string | null);

// Global (unnamespaced) Luau builtins that need access to runtime
// state. Each entry is a one-line registration: the registry is the
// single source of truth for source-level name → runtime behavior.
//
// Adding a new state-aware builtin is just:
//   tostring: { arity: 1, fn: (story, [v]) => stringify(v) },
//
// At lowering, `makeGlobalFunctionCall` (lowerExpression.ts) checks
// this table when a bare function-call name has no namespace
// receiver, and produces a `FunctionCall` whose name carries the
// stdlib id verbatim (lowercase, source form). The runtime's
// generic `RunStdLibFunction` ControlCommand pops `arity` values
// off the eval stack, calls `fn(story, args)`, and pushes the
// return value if it's non-undefined.
//
// This replaces the older per-builtin pattern of (ControlCommand
// enum entry + JsonSerialisation name + FunctionCall dispatch
// branch + Story.ts runtime case) with a single registry plus one
// generic dispatcher. See task #77.
export const GLOBAL_STDLIB: Record<string, StateAwareStdLibEntry> = {
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
// rather than in NAMESPACED_STDLIB.
//
// `count.turns` is overloaded by arity:
//   - `count.turns()` (no args)       → `TURNS`        (total turns elapsed)
//   - `count.turns(-> target)` (1 arg) → `TURNS_SINCE`  (turns since target)
// Same conceptual operation, "turn counter against a reference point",
// disambiguated by whether a reference point was provided.
export const INK_BUILTIN_ALIASES: Record<string, Record<string, InkBuiltinAlias>> = {
  math: {
    random: "RANDOM",
    randomseed: "SEED_RANDOM",
  },
  count: {
    turns: (argCount) =>
      argCount === 0 ? "TURNS" : argCount === 1 ? "TURNS_SINCE" : null,
    visits: "READ_COUNT",
    choices: "CHOICE_COUNT",
  },
  // `plural.category(n)` migrated to `GLOBAL_STDLIB` (state-aware
  // entry). The lowerer's `lookupStdLibBuiltin` falls back to the
  // GLOBAL_STDLIB table for dotted names not found here.
};

// Returns the runtime builtin name for a `<receiver>.<method>(args)`
// call if one is registered, or `null` otherwise. Used by the lowerer to
// decide whether to translate a method-call into a direct builtin call.
//
// For NAMESPACED_STDLIB entries, the returned name is the dotted full name
// (`"math.floor"`) which `NativeFunctionCall` dispatches on. For
// INK_BUILTIN_ALIASES entries, it's the ink name (`"TURNS"`) which
// `FunctionCall.GenerateIntoContainer` dispatches on.
//
// `argCount` lets a single Luau-style method name resolve to different
// ink builtins based on arity (see `story.turns` above). NAMESPACED_STDLIB entries
// don't consult `argCount` — `NativeFunctionCall` enforces the
// registered arity itself at the runtime.
export function lookupStdLibBuiltin(
  receiverName: string,
  methodName: string,
  argCount: number,
): string | null {
  if (NAMESPACED_STDLIB[receiverName]?.[methodName] != null) {
    return `${receiverName}.${methodName}`;
  }
  // State-aware namespaced builtins live in `GLOBAL_STDLIB` under
  // the dotted full name (e.g. `"plural.category"`). The compiler
  // returns the same dotted name as the FunctionCall name, and
  // `FunctionCall.isStateAwareStdLib` picks it up via the registry.
  const fullName = `${receiverName}.${methodName}`;
  if (GLOBAL_STDLIB[fullName] != null) {
    return fullName;
  }
  const alias = INK_BUILTIN_ALIASES[receiverName]?.[methodName];
  if (alias == null) return null;
  return typeof alias === "string" ? alias : alias(argCount);
}

// Returns the resolved name for a bare (unnamespaced) source-level
// call to a state-aware stdlib builtin, or `null` if the name isn't
// registered. Today the resolved name equals the source name —
// `assert` stays `assert` end-to-end. The function exists so the
// lowerer can ask "is this a registered global stdlib?" without
// importing the full registry object. After #77's generic
// dispatcher lands, the FunctionCall dispatch branch checks the
// same registry directly and this helper goes away.
export function lookupGlobalStdLibBuiltin(
  name: string,
  _argCount: number,
): string | null {
  return GLOBAL_STDLIB[name] != null ? name : null;
}

// Direct registry lookup for state-aware builtins. Returns the
// registered entry (`{arity, fn}`) or `null` if the name isn't
// known. Used today by the per-function ControlCommand runtime
// handlers as the single source of truth for behavior — e.g.
// the Assert ControlCommand case in Story.ts delegates to
// `lookupStateAwareStdLib("assert").fn(story, args)` rather than
// inlining the logic. After #77's generic dispatcher lands, the
// runtime will call this directly from the generic handler and
// the per-function handlers can be removed.
export function lookupStateAwareStdLib(
  name: string,
): StateAwareStdLibEntry | null {
  return GLOBAL_STDLIB[name] ?? null;
}
