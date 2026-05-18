import { getPluralCategory } from "./PluralRules";
import { PRNG } from "./PRNG";

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

export interface StdLibEntry {
  /** Number of stack values to pop before calling `fn`. */
  arity: number;
  /**
   * Pure entries (`pure: true`) ignore the `story` arg, take + return
   * raw JS numbers, and get auto-registered with `NativeFunctionCall`
   * at engine init — preserving the type-coercion fast path for math
   * ops. Non-pure entries (`pure` omitted / false) route through the
   * generic `RunStdLibFunction` dispatcher in Story.ts.
   *
   * The dispatch decision happens in `FunctionCall.GenerateIntoContainer`:
   * pure entries fall through to the existing `NativeFunctionCall`
   * branch (because they're registered there); non-pure entries match
   * `isStateAwareStdLib` and emit `RunStdLibFunction`.
   */
  pure?: boolean;
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
export const STDLIB: Record<string, StdLibEntry> = {
  // ============================================================
  // `math.*` — pure numeric helpers (auto-registered with NativeFunctionCall)
  // ============================================================
  "math.abs": { arity: 1, pure: true, fn: (_, [v]) => Math.abs(v) },
  "math.ceil": { arity: 1, pure: true, fn: (_, [v]) => Math.ceil(v) },
  "math.cos": { arity: 1, pure: true, fn: (_, [v]) => Math.cos(v) },
  "math.exp": { arity: 1, pure: true, fn: (_, [v]) => Math.exp(v) },
  "math.floor": { arity: 1, pure: true, fn: (_, [v]) => Math.floor(v) },
  "math.log": { arity: 1, pure: true, fn: (_, [v]) => Math.log(v) },
  "math.max": { arity: 2, pure: true, fn: (_, [a, b]) => Math.max(a, b) },
  "math.min": { arity: 2, pure: true, fn: (_, [a, b]) => Math.min(a, b) },
  "math.pow": { arity: 2, pure: true, fn: (_, [a, b]) => Math.pow(a, b) },
  "math.sin": { arity: 1, pure: true, fn: (_, [v]) => Math.sin(v) },
  "math.sqrt": { arity: 1, pure: true, fn: (_, [v]) => Math.sqrt(v) },
  "math.tan": { arity: 1, pure: true, fn: (_, [v]) => Math.tan(v) },

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

  // `math.random(min, max)` — integer in `[min, max]` (inclusive).
  // Uses `story.state.storySeed + previousRandom` as PRNG seed and
  // updates `previousRandom` so successive calls are deterministic
  // given the seed. Both args must be integers; non-integer or
  // missing values are a runtime error.
  "math.random": {
    arity: 2,
    fn: (story, [minVal, maxVal]) => {
      const min = coerceNumber(minVal);
      const max = coerceNumber(maxVal);
      if (min === null || !Number.isInteger(min)) {
        story.Error(
          "Invalid value for minimum parameter of math.random(min, max)",
        );
        return 0;
      }
      if (max === null || !Number.isInteger(max)) {
        story.Error(
          "Invalid value for maximum parameter of math.random(min, max)",
        );
        return 0;
      }
      // JS has no true integers, so guard against overflow when
      // (max - min + 1) exceeds safe-integer range.
      let randomRange = max - min + 1;
      if (!isFinite(randomRange) || randomRange > Number.MAX_SAFE_INTEGER) {
        randomRange = Number.MAX_SAFE_INTEGER;
        story.Error(
          "math.random was called with a range that exceeds the size that ink numbers can use.",
        );
      }
      if (randomRange <= 0) {
        story.Error(
          `math.random was called with minimum as ${min} and maximum as ${max}. The maximum must be larger`,
        );
      }
      const seed = story.state.storySeed + story.state.previousRandom;
      const prng = new PRNG(seed);
      const next = prng.next();
      const chosen = (next % randomRange) + min;
      story.state.previousRandom = next;
      return chosen;
    },
  },

  // `math.randomseed(seed)` — set the PRNG seed and reset
  // `previousRandom` to 0. Returns nothing (Void). Used to make
  // RNG-dependent scripts deterministic across runs.
  "math.randomseed": {
    arity: 1,
    fn: (story, [seedVal]) => {
      const seed = coerceNumber(seedVal);
      if (seed === null) {
        story.Error("Invalid value passed to math.randomseed");
        return;
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

// Direct registry lookup for state-aware builtins. Returns the
// registered entry (`{arity, fn}`) or `null` if the name isn't a
// state-aware entry. Pure entries (`pure: true`) are intentionally
// excluded here — they dispatch through `NativeFunctionCall` and the
// generic `RunStdLibFunction` runtime handler should never receive
// them. Used by `FunctionCall.isStateAwareStdLib` (compile-time) and
// the generic dispatcher in Story.ts (runtime) to route only the
// non-pure entries through the generic path.
export function lookupStateAwareStdLib(name: string): StdLibEntry | null {
  const entry = STDLIB[name];
  if (entry == null || entry.pure) return null;
  return entry;
}

// Returns the entry for a pure-numeric stdlib function, or `null`
// otherwise. Used by `NativeFunctionCall.GenerateNativeFunctionsIfNecessary`
// at engine init to iterate the pure entries and register them with
// the operator-style dispatch path.
export function getPureStdLibEntries(): Array<[string, StdLibEntry]> {
  return Object.entries(STDLIB).filter(([, entry]) => entry.pure === true);
}
