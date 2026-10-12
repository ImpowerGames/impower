import { InkObject } from "./Object";
import { BoolValue, MultiValue, NullValue } from "./Value";
import { Void } from "./Void";

// Lua truthiness: ONLY `nil` and `false` are falsy. Everything else —
// including 0, 0.0, "", empty tables, functions, divert targets — is
// truthy. This deliberately diverges from ink truthiness
// (`Value.isTruthy`), where 0 / "" / empty containers are falsy;
// ink-style narrative constructs (choice conditions, `{cond:}`
// interpolations, alternators) keep ink semantics via `Story.IsTruthy`,
// while Luau constructs (`if`/`while`/`repeat` conditions via the
// TRUTHY normalize op, `and`/`or` operand selection, `not`) route
// through this predicate.
//
// Lives in its own leaf module (rather than Value.ts) so that
// NativeFunctionCall, Story, StdLib, and the compiler can all import
// it without feeding the existing Container↔Value↔Object load-order
// cycle.
export function isLuauTruthy(obj: InkObject | null | undefined): boolean {
  if (obj == null) return false;
  // `nil` is falsy.
  if (obj instanceof NullValue) return false;
  // A Void (function returned no values) coerces to nil → falsy.
  if (obj instanceof Void) return false;
  // `false` is falsy; `true` is truthy.
  if (obj instanceof BoolValue) return obj.value === true;
  // Multi-return truncates to its first value in single-value contexts;
  // an empty pack is nil.
  if (obj instanceof MultiValue) {
    const first = obj.values[0];
    return first == null ? false : isLuauTruthy(first);
  }
  return true;
}
