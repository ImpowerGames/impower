import {
  Container,
  ControlCommand,
  RuntimeObject,
  Void,
} from "../../../impower-script-engine";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedObject } from "./ParsedObject";

export class ParsedReturn extends ParsedObject {
  returnedExpression: ParsedExpression;

  constructor(returnedExpression: ParsedExpression = null) {
    super();
    if (returnedExpression) {
      this.returnedExpression = this.AddContent(returnedExpression);
    }
  }

  override GenerateRuntimeObject(): RuntimeObject {
    const container = new Container();

    // Evaluate expression
    if (this.returnedExpression) {
      container.AddContent(this.returnedExpression.runtimeObject);
    }

    // Return Runtime.Void when there's no expression to evaluate
    // (This evaluation will just add the Void object to the evaluation stack)
    else {
      container.AddContent(ControlCommand.EvalStart());
      container.AddContent(new Void());
      container.AddContent(ControlCommand.EvalEnd());
    }

    // Then pop the call stack
    // (the evaluated expression will leave the return value on the evaluation stack)
    container.AddContent(ControlCommand.PopFunction());

    return container;
  }
}
