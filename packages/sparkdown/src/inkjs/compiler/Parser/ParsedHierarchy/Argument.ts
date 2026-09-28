import { Identifier } from "./Identifier";

export class Argument {
  constructor(
    public identifier: Identifier | null = null,
    public isByReference: boolean | null = null,
    public isDivertTarget: boolean | null = null,
    // Luau `function f(a, ...)` — the trailing `...` parameter
    // captures all extra positional args into a single MultiValue
    // bound to a synthetic local (`__varargs__`). The body's `...`
    // expression reads this local. Set on the synthetic Argument
    // emitted by `lowerArguments` when it sees a `LuauVariadicParameter`.
    public isVararg: boolean = false,
    // A function's captured variable, prepended to its parameters when the
    // function is lowered inside another (`buildAnonymousFunction`, a
    // variadic nested function, a `function a.f` or `function a:m`
    // definition). The call binds it to a pointer at the variable the
    // enclosing scope resolved the name to, so a write through it lands on
    // that outer binding rather than on a local of the function.
    public isUpvalue: boolean = false,
  ) {}

  get typeName(): string {
    return "Argument";
  }
}
