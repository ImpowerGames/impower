import { InkObject } from "./Object";

export class VariableAssignment extends InkObject {
  public readonly variableName: string | null;
  public readonly isNewDeclaration: boolean;
  public isGlobal: boolean;
  // True for the synthetic `__varargs__` binding emitted at the
  // entry of a variadic function (`function f(a, ...)`). The runtime
  // skips its normal MultiValue → first-value unwrapping for this
  // assignment, so the local keeps the packed MultiValue intact and
  // `...` in the body reads back the full tuple of extra args.
  public isVarargsSlot: boolean;
  /** Set for the initializer of the declaration just before it (`SetVar`'s
   *  `SET_INITIALIZE`, #1720): it assigns as any assignment does, and is no
   *  write a data breakpoint's write watch hears, since it is part of the
   *  declaration. */
  public readonly isInitializer: boolean;

  constructor(
    variableName: string | null,
    isNewDeclaration: boolean,
    isVarargsSlot: boolean = false,
    isInitializer: boolean = false,
  ) {
    super();
    this.variableName = variableName || null;
    this.isNewDeclaration = !!isNewDeclaration;
    this.isGlobal = false;
    this.isVarargsSlot = isVarargsSlot;
    this.isInitializer = isInitializer;
  }

  public override toString(): string {
    return "VarAssign to " + this.variableName;
  }
}
