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
