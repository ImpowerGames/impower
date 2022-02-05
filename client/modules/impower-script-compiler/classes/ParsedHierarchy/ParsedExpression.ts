import {
  Container,
  ControlCommand,
  RuntimeObject,
} from "../../../impower-script-engine";
import { IExpression } from "../../types/IExpression";
import { ParsedObject } from "./ParsedObject";

export abstract class ParsedExpression
  extends ParsedObject
  implements IExpression
{
  outputWhenComplete = false;

  private _prototypeRuntimeConstantExpression: Container = null;

  abstract GenerateIntoContainer(container: Container): void;

  override GenerateRuntimeObject(): RuntimeObject {
    const container = new Container();

    // Tell Runtime to start evaluating the following content as an expression
    container.AddContent(ControlCommand.EvalStart());

    this.GenerateIntoContainer(container);

    // Tell Runtime to output the result of the expression evaluation to the output stream
    if (this.outputWhenComplete) {
      container.AddContent(ControlCommand.EvalOutput());
    }

    // Tell Runtime to stop evaluating the content as an expression
    container.AddContent(ControlCommand.EvalEnd());

    return container;
  }

  // When generating the value of a constant expression,
  // we can't just keep generating the same constant expression into
  // different places where the constant value is referenced, since then
  // the same runtime objects would be used in multiple places, which
  // is impossible since each runtime object should have one parent.
  // Instead, we generate a prototype of the runtime object(s), then
  // copy them each time they're used.
  GenerateConstantIntoContainer(container: Container): void {
    if (this._prototypeRuntimeConstantExpression == null) {
      this._prototypeRuntimeConstantExpression = new Container();
      this.GenerateIntoContainer(this._prototypeRuntimeConstantExpression);
    }

    this._prototypeRuntimeConstantExpression.content.forEach((runtimeObj) => {
      container.AddContent(runtimeObj.Copy());
    });
  }
}
