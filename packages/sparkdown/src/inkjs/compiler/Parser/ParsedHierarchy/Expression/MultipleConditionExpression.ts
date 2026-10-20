import { Expression } from "./Expression";
import { NativeFunctionCall } from "../../../../../runtime/NativeFunctionCall";
import type { ProgramEmitter } from "../../../../../program/ProgramEmitter";
import { Op } from "../../../../../program/ProgramInstructions";

export class MultipleConditionExpression extends Expression {
  get subExpressions(): Expression[] {
    return this.content as Expression[];
  }

  constructor(conditionExpressions: Expression[]) {
    super();

    this.AddContent(conditionExpressions);
  }

  override get typeName(): string {
    return "MultipleConditionExpression";
  }

  public override EmitExpression(emitter: ProgramEmitter): void {
    this.subExpressions.forEach((conditionExpr, i) => {
      emitter.emitObject(conditionExpr);
      if (i > 0) {
        emitter.emit(Op.Native, emitter.string(NativeFunctionCall.And), 2);
      }
    });
  }

  public override PrepareIntoContainer(): void {
    for (const conditionExpr of this.subExpressions) {
      conditionExpr.PrepareIntoContainer();
    }
  }
}
