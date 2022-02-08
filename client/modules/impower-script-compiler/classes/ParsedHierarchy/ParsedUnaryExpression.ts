import { Container, NativeFunctionCall } from "../../../impower-script-engine";
import { ParsedExpression } from "./ParsedExpression";
import { ParsedNumber } from "./ParsedNumber";

export class ParsedUnaryExpression extends ParsedExpression {
  innerExpression: ParsedExpression = null;

  op: string = null;

  private get nativeNameForOp(): string {
    // Replace "-" with "_" to make it unique (compared to subtraction)
    if (this.op === "-") return "_";
    if (this.op === "not") return "!";
    return this.op;
  }

  // Attempt to flatten inner expression immediately
  // e.g. convert (-(5)) into (-5)
  static WithInner(inner: ParsedExpression, op: string): ParsedExpression {
    const innerNumber = inner;
    if (innerNumber instanceof ParsedNumber) {
      if (op === "-") {
        if (
          typeof innerNumber.value === "number" &&
          Number.isInteger(innerNumber.value)
        ) {
          return new ParsedNumber(-innerNumber.value);
        }
        if (typeof innerNumber.value === "number") {
          return new ParsedNumber(-innerNumber.value);
        }
      } else if (op === "!" || op === "not") {
        if (
          typeof innerNumber.value === "number" &&
          Number.isInteger(innerNumber.value)
        ) {
          return new ParsedNumber(innerNumber.value === 0);
        }
        if (typeof innerNumber.value === "number") {
          return new ParsedNumber(innerNumber.value === 0.0);
        }
        if (typeof innerNumber.value === "boolean") {
          return new ParsedNumber(!innerNumber.value);
        }
      }

      throw new Error("Unexpected operation or number type");
    }

    // Normal fallback
    const unary = new ParsedUnaryExpression(inner, op);
    return unary;
  }

  constructor(inner: ParsedExpression, op: string) {
    super();
    this.innerExpression = this.AddContent(inner);
    this.op = op;
  }

  override GenerateIntoContainer(container: Container): void {
    this.innerExpression.GenerateIntoContainer(container);

    container.AddContent(NativeFunctionCall.CallWithName(this.nativeNameForOp));
  }

  override ToString(): string {
    return this.nativeNameForOp + this.innerExpression;
  }
}
