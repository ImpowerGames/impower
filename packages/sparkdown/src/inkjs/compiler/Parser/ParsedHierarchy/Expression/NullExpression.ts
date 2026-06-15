import { Container as RuntimeContainer } from "../../../../engine/Container";
import { NullValue } from "../../../../engine/Value";
import { Expression } from "./Expression";
import { ParsedObject } from "../Object";

// Sparkdown's first-class `nil` literal. Emits a runtime `NullValue`,
// which has its own ValueType (`ValueType.Null`) distinct from `Int`,
// `Float`, etc. Equality semantics: `nil == nil` is true; `nil ==
// anything-else` is false. Falsy in conditionals (`isTruthy` returns
// false). Used by the grammar's `LuauNil` lowering and by anywhere
// the lowerer needs to synthesize a nil sentinel (e.g. the
// iterator-end check in generic-for loops).
export class NullExpression extends Expression {
  get typeName(): string {
    return "Null";
  }

  public readonly GenerateIntoContainer = (
    container: RuntimeContainer,
  ): void => {
    container.AddContent(new NullValue());
  };

  public readonly toString = (): string => "nil";

  public Equals(obj: ParsedObject): boolean {
    return obj instanceof NullExpression;
  }
}
