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
  ) {}

  get typeName(): string {
    return "Argument";
  }
}
