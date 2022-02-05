import { Container, NativeFunctionCall } from "../../../impower-script-engine";
import { ParsedExpression } from "./ParsedExpression";

export class ParsedMultipleConditionExpression extends ParsedExpression {
  get subExpressions(): ParsedExpression[] {
    return this.content as ParsedExpression[];
  }

  constructor(conditionExpressions: ParsedExpression[]) {
    super();
    this.AddContent(conditionExpressions);
  }

  override GenerateIntoContainer(container: Container): void {
    //    A && B && C && D
    // => (((A B &&) C &&) D &&) etc
    let isFirst = true;
    this.subExpressions.forEach((conditionExpr) => {
      conditionExpr.GenerateIntoContainer(container);

      if (!isFirst) {
        container.AddContent(NativeFunctionCall.CallWithName("&&"));
      }

      isFirst = false;
    });
  }
}
