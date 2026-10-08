import { Expression } from "./Expression/Expression";
import { ParsedObject } from "./Object";
import { Container as RuntimeContainer } from "../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../engine/ControlCommand";
import { InkObject as RuntimeObject } from "../../../../runtime/Object";
import { Void } from "../../../../runtime/Void";
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

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();

    if (this.returnedExpression) {
      // Evaluate expression
      container.AddContent(this.returnedExpression.runtimeObject);
    } else {
      // Return Runtime.Void when there's no expression to evaluate
      // (This evaluation will just add the Void object to the evaluation stack)
      container.AddContent(RuntimeControlCommand.EvalStart());
      container.AddContent(new Void());
      container.AddContent(RuntimeControlCommand.EvalEnd());
    }

    // Then pop the call stack
    // (the evaluated expression will leave the return value on the evaluation stack)
    container.AddContent(RuntimeControlCommand.PopFunction());

    return container;
  };
}
