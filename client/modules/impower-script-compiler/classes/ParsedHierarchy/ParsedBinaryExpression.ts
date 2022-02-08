import { Container, NativeFunctionCall } from "../../../impower-script-engine";
import { IStory } from "../../types/IStory";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedUnaryExpression } from "./ParsedUnaryExpression";

export class ParsedBinaryExpression extends ParsedExpression {
  leftExpression: ParsedExpression = null;

  rightExpression: ParsedExpression = null;

  opName: string = null;

  constructor(left: ParsedExpression, right: ParsedExpression, opName: string) {
    super();
    this.leftExpression = this.AddContent(left);
    this.rightExpression = this.AddContent(right);
    this.opName = opName;
  }

  override GenerateIntoContainer(container: Container): void {
    this.leftExpression.GenerateIntoContainer(container);
    this.rightExpression.GenerateIntoContainer(container);
    this.opName = this.NativeNameForOp(this.opName);

    container.AddContent(NativeFunctionCall.CallWithName(this.opName));
  }

  override ResolveReferences(context: IStory): void {
    super.ResolveReferences(context);

    // Check for the following case:
    //
    //    (not A) ? B
    //
    // Since this easy to accidentally do:
    //
    //    not A ? B
    //
    // when you intend:
    //
    //    not (A ? B)
    if (this.NativeNameForOp(this.opName) === "?") {
      const leftUnary = this.leftExpression;
      if (
        leftUnary instanceof ParsedUnaryExpression &&
        (leftUnary.op === "not" || leftUnary.op === "!")
      ) {
        this.Error(
          `Using 'not' or '!' here negates '${leftUnary.innerExpression}' rather than the result of the '?' or 'has' operator. You need to add parentheses around the (A ? B) expression.`
        );
      }
    }
  }

  private NativeNameForOp(opName: string): string {
    if (opName === "and") return "&&";

    if (opName === "or") return "||";

    if (opName === "mod") return "%";

    if (opName === "has") return "?";

    if (opName === "hasnt") return "!?";

    return opName;
  }

  override ToString(): string {
    return `(${this.leftExpression} ${this.opName} ${this.rightExpression})`;
  }
}
