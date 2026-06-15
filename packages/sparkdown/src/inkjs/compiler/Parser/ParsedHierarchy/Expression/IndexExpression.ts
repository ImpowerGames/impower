import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { Expression } from "./Expression";
import { ParsedObject } from "../Object";

// Index access — `base[key]`. The base is any Expression that puts a value
// on the eval stack (e.g. an ObjectValue from a table literal, a string,
// the result of a function call). At runtime IndexValue pops `key` and
// `base` and pushes `base[key]`.
export class IndexExpression extends Expression {
  public readonly baseExpression: Expression;
  public readonly keyExpression: Expression;

  constructor(base: Expression, key: Expression) {
    super();
    this.baseExpression = this.AddContent(base) as Expression;
    this.keyExpression = this.AddContent(key) as Expression;
  }

  get typeName(): string {
    return "IndexExpression";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    this.baseExpression.GenerateIntoContainer(container);
    this.keyExpression.GenerateIntoContainer(container);
    container.AddContent(RuntimeControlCommand.IndexValue());
  };

  public readonly toString = (): string =>
    `${this.baseExpression}[${this.keyExpression}]`;

  public Equals(obj: ParsedObject): boolean {
    if (!(obj instanceof IndexExpression)) return false;
    return (
      this.baseExpression.Equals(obj.baseExpression) &&
      this.keyExpression.Equals(obj.keyExpression)
    );
  }
}
