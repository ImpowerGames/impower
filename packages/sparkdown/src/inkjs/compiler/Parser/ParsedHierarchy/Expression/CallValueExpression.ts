import { Expression } from "./Expression";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

// Call an arbitrary expression value (closure, DivertTargetValue, or
// `__call`-equipped table) with a list of pre-evaluated args. The
// expression evaluates to the callable; runtime `CallValueAsFunction`
// pops it (and the args below it), then dispatches via the same path
// closure literals and direct DivertTargetValue calls use.
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

  constructor(target: Expression, args: Expression[]) {
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
  // arguments, and `Pop` where the value is discarded.
  public override EmitExpression(emitter: ProgramEmitter): void {
    for (const arg of this.args) {
      emitter.emitObject(arg);
    }
    emitter.emitObject(this.targetExpression);
    emitter.emit(Op.CallValue, 0, this.args.length);
    if (this.shouldPopReturnedValue) {
      emitter.emit(Op.Pop);
    }
  }

  public override readonly toString = (): string =>
    `${this.targetExpression}(${this.args.map((a) => a.toString()).join(", ")})`;
}
