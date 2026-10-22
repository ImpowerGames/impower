import { Expression } from "./Expression";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { CALL_METHOD, Op } from "../../../../../program/ProgramInstructions";

// Call an arbitrary expression value (closure, symbol value, or
// `__call`-equipped table) with a list of pre-evaluated args. The
// expression evaluates to the callable; the program engine's `CallValue`
// pops it (and the args below it), then dispatches via the same path
// closure literals and direct symbol-value calls use.
//
// Used by `lowerMethodCall` when the method receiver isn't a stdlib
// namespace — sparkdown can't statically resolve `a.method(args)` to
// a top-level flow, so it lowers to "evaluate `a.method` as a value
// and call it" instead of receiver-threading to a flow named `method`.
//
// The return value remains on the eval stack after the call — so the
// expression can be used in any position (RHS of assignment, function
// arg, etc.). Statement-position callers set `shouldPopReturnedValue`
// to discard it.
export class CallValueExpression extends Expression {
  public readonly targetExpression: Expression;
  public readonly args: Expression[];
  public shouldPopReturnedValue: boolean = false;

  // `methodName` is the method a colon call (`recv:name(...)`) names, whose
  // first argument is the receiver; a dot call or any other call has none.
  constructor(
    target: Expression,
    args: Expression[],
    public readonly methodName: string | null = null,
  ) {
    super();
    this.targetExpression = this.AddContent(target) as Expression;
    this.args = args.map((a) => this.AddContent(a) as Expression);
  }

  override get typeName(): string {
    return "CallValueExpression";
  }

  public override PrepareIntoContainer(): void {
    for (const arg of this.args) {
      arg.PrepareIntoContainer();
    }
    this.targetExpression.PrepareIntoContainer();
  }

  // The arguments, the callable, then `CallValue` with the number of
  // arguments, naming the method of a colon call, and `Pop` where the value
  // is discarded.
  public override EmitExpression(emitter: ProgramEmitter): void {
    for (const arg of this.args) {
      emitter.emitObject(arg);
    }
    emitter.emitObject(this.targetExpression);
    if (this.methodName !== null) {
      emitter.emit(
        Op.CallValue,
        emitter.string(this.methodName),
        this.args.length,
        CALL_METHOD,
      );
    } else {
      emitter.emit(Op.CallValue, 0, this.args.length);
    }
    if (this.shouldPopReturnedValue) {
      emitter.emit(Op.Pop);
    }
  }

  public override readonly toString = (): string =>
    `${this.targetExpression}(${this.args.map((a) => a.toString()).join(", ")})`;
}
