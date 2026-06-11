import { Container as RuntimeContainer } from "../../../../engine/Container";
import { Expression } from "./Expression";
import { NativeFunctionCall } from "../../../../engine/NativeFunctionCall";

export class BinaryExpression extends Expression {
  public readonly leftExpression: Expression;
  public readonly rightExpression: Expression;

  constructor(
    left: Expression,
    right: Expression,
    public opName: string,
  ) {
    super();

    this.leftExpression = this.AddContent(left) as Expression;
    this.rightExpression = this.AddContent(right) as Expression;

    this.opName = opName;
  }

  get typeName(): string {
    return "BinaryExpression";
  }

  public readonly GenerateIntoContainer = (container: RuntimeContainer) => {
    this.leftExpression.GenerateIntoContainer(container);
    this.rightExpression.GenerateIntoContainer(container);
    this.opName = this.NativeNameForOp(this.opName);
    container.AddContent(NativeFunctionCall.CallWithName(this.opName));
  };

  public readonly NativeNameForOp = (opName: string): string => {
    // Source keywords (`and`/`or`/`not`) flow through verbatim — the native
    // functions are registered under the keyword form so error messages and
    // JSON output match what the user wrote.
    //
    // Symbol aliases that map source-level Luau operators onto the
    // existing ink runtime native names:
    //   - `mod` → `%`: keyword form of the modulo symbol.
    //   - `^`   → `POW`: Luau exponentiation (matching `math.pow`).
    //   - `..` flows through as its OWN native op (a Lua-semantics
    //     special case in `NativeFunctionCall.Call`): it stringifies
    //     number operands (`1 .. 2` is "12", NOT 3 — the old `+`
    //     alias ADDED numeric operands) and raises Lua's "attempt to
    //     concatenate <type> with <type>" on nil/boolean/table
    //     operands (basic.luau line 123 pattern-matches that message
    //     through pcall).
    if (opName === "mod") {
      return "%";
    }
    if (opName === "^") {
      return NativeFunctionCall.Pow;
    }
    if (opName === "~=") {
      // Luau not-equal — the runtime registers the C-style `!=` form.
      return NativeFunctionCall.NotEquals;
    }

    return opName;
  };

  public readonly toString = (): string =>
    `(${this.leftExpression} ${this.opName} ${this.rightExpression})`;
}
