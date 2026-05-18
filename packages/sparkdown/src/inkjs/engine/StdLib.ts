// Sparkdown's Luau-standard-library bridge. Three tables drive everything:
//
//   - `STDLIB` — pure numeric JS functions (`math.floor`, `math.cos`, ...).
//     Adding a method here auto-registers it with `NativeFunctionCall`
//     under its dotted full name, and the lowerer picks it up via
//     `lookupStdLibBuiltin`.
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
// etc. — and therefore can't live in the pure-numeric `STDLIB` table.
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

// Re-export the method-dispatch surface so external callers
// (compiler, runtime engine) see one entry point. The actual table
// and helpers live in `MethodDispatch.ts` to keep this file small.
export {
  METHOD_DISPATCH,
  METHOD_PREFIX,
  callBuiltinMethod,
  isBuiltinMethod,
} from "./MethodDispatch";

// Pure numeric functions implemented directly in JS. Adding a new entry
// here also adds it to `NativeFunctionCall`'s registry at engine init.
export const STDLIB: Record<string, Record<string, StdLibFn>> = {
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
  // `assert(cond [, message])` — Luau-style assertion. Raises a
  // runtime error via `story.AddError(message)` when `cond` is
  // falsy. Sparkdown truthiness: `nil` / `0` / `false` / `""` are
  // falsy (documented divergence from Luau where `0` is truthy —
  // see DIVERGENCES.md).
  assert: {
    arity: 2,
    fn: (story, [cond, msg]) => {
      let truthy = true;
      // Mirror the per-Value checks used in the runtime — accept
      // raw JS values too in case the lowerer passes primitives.
      const v = cond;
      if (
        v == null ||
        v === false ||
        v === 0 ||
        v === "" ||
        (typeof v === "object" && "value" in v &&
          ((v as any).value === 0 ||
            (v as any).value === false ||
            (v as any).value === "" ||
            (v as any).value == null))
      ) {
        truthy = false;
      }
      if (!truthy) {
        const message =
          typeof msg === "string"
            ? msg
            : typeof msg === "object" && msg != null && "value" in msg &&
                typeof (msg as any).value === "string"
              ? (msg as any).value
              : "assertion failed";
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
// rather than in STDLIB.
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
  // `plural.category(n)` returns the CLDR plural category for `n`
  // ("zero" / "one" / "two" / "few" / "many" / "other") in the active
  // language. The runtime reads `lang.current` (default "en") to pick
  // the rule set, so authors can switch locales at runtime with
  // `lang.current = "fr"`. This is also the desugar target for
  // `plural(n)|one=...|other=...` alternators — see
  // `lowerSparkdownConditionalAlternatorBlock.ts`. The lookup returns
  // the source name itself (rather than an ink-style ALL_CAPS alias)
  // because `FunctionCall.isPluralCategory` checks for the source name
  // directly — the dispatch happens at compile time via
  // `RuntimeControlCommand.PluralCategory()`.
  plural: {
    category: "plural.category",
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
// ink builtins based on arity (see `story.turns` above). STDLIB entries
// don't consult `argCount` — `NativeFunctionCall` enforces the
// registered arity itself at the runtime.
export function lookupStdLibBuiltin(
  receiverName: string,
  methodName: string,
  argCount: number,
): string | null {
  if (STDLIB[receiverName]?.[methodName] != null) {
    return `${receiverName}.${methodName}`;
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
