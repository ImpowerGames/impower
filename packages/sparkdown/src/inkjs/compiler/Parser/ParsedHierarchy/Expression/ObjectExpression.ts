import { Container as RuntimeContainer } from "../../../../engine/Container";
import { Expression } from "./Expression";
import { ParsedObject } from "../Object";

export class ObjectExpression extends Expression {
  get typeName(): string {
    return "Object";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer
  ): void => {
    // container.AddContent(new ObjectValue({}));
  };

  public readonly toString = (): string => "{}";

  public Equals(obj: ParsedObject): boolean {
    return false;
  }
}
