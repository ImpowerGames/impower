import { Container as RuntimeContainer } from "../../../../engine/Container";
import { Expression } from "./Expression";
import { NativeFunctionCall } from "../../../../engine/NativeFunctionCall";
import { NumberExpression } from "./NumberExpression";
import { asOrNull } from "../../../../engine/TypeAssertion";

export class UnaryExpression extends Expression {
  get nativeNameForOp(): string {
    // Unary minus is aliased to `_` so it doesn't collide with binary
    // subtraction's `-`. The length operator `#` is aliased to `LEN` because
    // `#` is also a control-command name (BeginTag) in serialized JSON.
    // Every other source keyword (`not`, etc.) flows through verbatim, so
    // runtime errors and JSON output match what the user wrote.
    if (this.op === "-") {
      return "_";
    } else if (this.op === "#") {
      return "LEN";
    }

    return this.op;
  }

  public innerExpression: Expression;

  // Attempt to flatten inner expression immediately
  // e.g. convert (-(5)) into (-5)
  public static readonly WithInner = (
    inner: Expression,
    op: string,
  ): Expression => {
    const innerNumber = asOrNull(inner, NumberExpression);

    if (innerNumber) {
      if (op === "-") {
        if (innerNumber.isInt()) {
          return new NumberExpression(-innerNumber.value, "int");
        } else if (innerNumber.isFloat()) {
          return new NumberExpression(-innerNumber.value, "float");
        }
      } else if (op == "not") {
        // Lua truthiness: every number is truthy (only nil and false
        // are falsy), so `not <number literal>` always folds to false.
        // Folding `not 0` to true here would bake ink truthiness into
        // the bytecode and contradict the runtime's Lua-correct `not`
        // (NativeFunctionCall's special case). basic.luau line 86's
        // section relies on 0 being truthy.
        if (innerNumber.isInt() || innerNumber.isFloat()) {
          return new NumberExpression(false, "bool");
        } else if (innerNumber.isBool()) {
          return new NumberExpression(!innerNumber.value, "bool");
        }
      }

      throw new Error("Unexpected operation or number type");
    }

    // Normal fallback
    const unary = new UnaryExpression(inner, op);

    return unary;
  };

  constructor(
    inner: Expression,
    public readonly op: string,
  ) {
    super();

    this.innerExpression = this.AddContent(inner) as Expression;
  }

  get typeName(): string {
    return "UnaryExpression";
  }

  public readonly GenerateIntoContainer = (container: RuntimeContainer) => {
    this.innerExpression.GenerateIntoContainer(container);
    container.AddContent(NativeFunctionCall.CallWithName(this.nativeNameForOp));
  };

  public readonly toString = (): string =>
    this.nativeNameForOp + this.innerExpression;
}
