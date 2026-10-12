import { InkObject } from "./Object";
import { AbstractValue, MultiValue, NullValue } from "./Value";
import { Void } from "./Void";

/** A value where Luau takes one value (a variable, a stored value, the table
 *  or key an index reads, the value a call calls, a method's receiver, an
 *  operand, and what a metamethod or a builtin's callback returns): a
 *  multiple value adjusts to its first, nil when it has none, and a call
 *  that returned none (`Void`) to nil. */
export function oneValue(value: AbstractValue): AbstractValue;
export function oneValue(value: AbstractValue | null): AbstractValue | null;
export function oneValue(value: InkObject): InkObject;
export function oneValue(value: InkObject | null): InkObject | null;
export function oneValue(value: InkObject | null): InkObject | null {
  if (value instanceof MultiValue) return value.values[0] ?? new NullValue();
  if (value instanceof Void) return new NullValue();
  return value;
}

// Lua-style call-arg spread of a builtin's arguments, or a `__call`
// handler's, in place: the syntactically LAST arg (rightmost) spreads its
// MultiValue into multiple args; earlier args truncate any MultiValue to its
// first inner value. `print(math.modf(3.7))` → `print(3, 0.7)`;
// `f(math.modf(x), 1)` → `f(3, 1)` (modf truncated since it's not the last
// arg). Pure stdlib fns called directly (registered with NativeFunctionCall)
// don't pass through here and continue to auto-unwrap via MultiValue's
// transparent valueObject.
//
// Void (from `(function() end)()`) is conceptually an empty MultiValue. As
// the last arg, it spreads to 0 values — `select('#', (function() end)())`
// returns 0, matching Luau's empty-return semantics. As a non-last arg, it's
// clamped to nil (same as MultiValue truncation).
//
// A leaf module, so the builtin method dispatch (`MethodDispatch.ts`), which
// `Story.ts` reaches through the standard library, can use these too.
export function spreadCallArgs(args: unknown[]): void {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a instanceof MultiValue) {
      if (k === args.length - 1) {
        args.splice(k, 1, ...a.values);
      } else {
        args[k] = a.values[0] ?? new NullValue();
      }
    } else if (a instanceof Void) {
      if (k === args.length - 1) {
        args.splice(k, 1);
      } else {
        args[k] = new NullValue();
      }
    }
  }
}
