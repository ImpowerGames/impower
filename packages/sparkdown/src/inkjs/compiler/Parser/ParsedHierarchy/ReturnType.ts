import { Expression } from "./Expression/Expression";
import { ParsedObject } from "./Object";
import type { ProgramEmitter } from "../../../../program/ProgramEmitter";
import { ConstValue, Op } from "../../../../program/ProgramInstructions";

export class ReturnType extends ParsedObject {
  public returnedExpression: Expression | null = null;

  constructor(returnedExpression: Expression | null = null) {
    super();

    if (returnedExpression) {
      this.returnedExpression = this.AddContent(
        returnedExpression,
      ) as Expression;
    }
  }

  override get typeName(): string {
    return "ReturnType";
  }

  // The returned value, or void, then `Return`.
  public override EmitProgram(emitter: ProgramEmitter): void {
    if (this.returnedExpression) {
      emitter.emitObject(this.returnedExpression);
    } else {
      emitter.emit(Op.Const, 0, ConstValue.Void);
    }
    emitter.emit(Op.Return);
  }

  protected override Prepare(): boolean {
    this.returnedExpression?.prepare();
    return true;
  }
}
