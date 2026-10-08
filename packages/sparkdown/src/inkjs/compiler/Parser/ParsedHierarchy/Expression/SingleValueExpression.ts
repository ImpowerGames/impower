import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand } from "../../../../../runtime/ControlCommand";
import { Expression } from "./Expression";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

// Lua's parenthesized-expression adjustment: `(expr)` always
// evaluates to exactly ONE value. A multi-return call truncates to
// its first value and a no-value call adjusts to nil —
// `pack(ret2(f()), (ret2(f())))` packs {1, 1}, NOT {1, 1, 2}
// (calls.luau line 210). Runtime `UnpackTuple(1)` implements exactly
// this adjustment (MultiValue → first inner value, Void → nil,
// scalar → unchanged), so the wrapper just appends it after the
// inner expression's ops.
export class SingleValueExpression extends Expression {
  public readonly innerExpression: Expression;

  constructor(inner: Expression) {
    super();
    this.innerExpression = this.AddContent(inner) as Expression;
  }

  override get typeName(): string {
    return "SingleValue";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    this.innerExpression.GenerateIntoContainer(container);
    container.AddContent(ControlCommand.UnpackTuple(1));
  };

  public override EmitExpression(emitter: ProgramEmitter): void {
    emitter.emitObject(this.innerExpression);
    emitter.emit(Op.Unpack, 1);
  }

  public override readonly toString = (): string => `(${this.innerExpression})`;
}
