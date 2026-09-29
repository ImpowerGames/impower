import { Container as RuntimeContainer } from "../../../../engine/Container";
import { Expression } from "./Expression";
import { NativeFunctionCall } from "../../../../engine/NativeFunctionCall";
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

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    //    A && B && C && D
    // => (((A B &&) C &&) D &&) etc
    let isFirst: boolean = true;
    for (const conditionExpr of this.subExpressions) {
      conditionExpr.GenerateIntoContainer(container);

      if (!isFirst) {
        container.AddContent(NativeFunctionCall.CallWithName(NativeFunctionCall.And));
      }

      isFirst = false;
    }
  };
}
