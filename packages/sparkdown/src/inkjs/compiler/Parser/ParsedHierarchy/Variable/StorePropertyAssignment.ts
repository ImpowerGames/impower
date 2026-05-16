import { Container as RuntimeContainer } from "../../../../engine/Container";
import { ControlCommand as RuntimeControlCommand } from "../../../../engine/ControlCommand";
import { InkObject as RuntimeObject } from "../../../../engine/Object";
import { Expression } from "../Expression/Expression";
import { ParsedObject } from "../Object";

// Mutating assignment into an existing object property: `obj.field = value`,
// `obj.a.b = value`, etc.
//
// The lowered shape is three expressions plus a `StoreIndex` runtime command:
//   1. `base` — evaluates to the container ObjectValue (e.g. a
//      `VariableReference([obj])` or a chain `IndexExpression(...)` that
//      reaches the final container).
//   2. `key`  — evaluates to a `StringValue` for `.field` access or any
//      indexable value for `[expr]` access.
//   3. `value` — the right-hand-side expression.
//
// Wrapped in `EvalStart`/`EvalEnd`, the runtime evaluates all three, then
// `StoreIndex` pops them and mutates the container in place. Because
// `ObjectValue.value` is a `Map<string, AbstractValue>` shared by reference,
// the change is visible through the original variable.
//
// This is a *statement*: it leaves nothing on the eval stack and has no
// result value. Compound assignments (`obj.field += v`) are desugared by the
// lowerer to read the current value, compute the new one, and store back.
export class StorePropertyAssignment extends ParsedObject {
  public readonly baseExpression: Expression;
  public readonly keyExpression: Expression;
  public readonly valueExpression: Expression;

  constructor(base: Expression, key: Expression, value: Expression) {
    super();
    this.baseExpression = this.AddContent(base) as Expression;
    this.keyExpression = this.AddContent(key) as Expression;
    this.valueExpression = this.AddContent(value) as Expression;
  }

  get typeName(): string {
    return "StorePropertyAssignment";
  }

  public readonly GenerateRuntimeObject = (): RuntimeObject => {
    const container = new RuntimeContainer();
    container.AddContent(RuntimeControlCommand.EvalStart());
    this.baseExpression.GenerateIntoContainer(container);
    this.keyExpression.GenerateIntoContainer(container);
    this.valueExpression.GenerateIntoContainer(container);
    container.AddContent(RuntimeControlCommand.StoreIndex());
    container.AddContent(RuntimeControlCommand.EvalEnd());
    return container;
  };

  public readonly toString = (): string =>
    `${this.baseExpression}[${this.keyExpression}] = ${this.valueExpression}`;
}
