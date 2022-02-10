import { ValueType } from "../types/ValueType";
import { BoolValue } from "./BoolValue";
import { FloatValue } from "./FloatValue";
import { NullException } from "./NullException";
import { StringValue } from "./StringValue";
import { Value } from "./Value";

export const isIntValue = (obj: unknown): obj is IntValue => {
  const value = obj as IntValue;
  return value.valueType === "Int";
};

export class IntValue extends Value<number> {
  constructor(val: number) {
    super(val || 0);
  }

  public get isTruthy(): boolean {
    return this.value !== 0;
  }

  public get valueType(): "Int" {
    return "Int";
  }

  override Copy(): IntValue {
    const obj = new IntValue(this.value);
    return obj;
  }

  public Cast(newType: ValueType): Value<unknown> {
    if (this.value === null) {
      throw new NullException("Value.value");
    }

    if (newType === this.valueType) {
      return this;
    }

    if (newType === "Bool") {
      return new BoolValue(this.value !== 0);
    }

    if (newType === "Float") {
      return new FloatValue(this.value);
    }

    if (newType === "String") {
      return new StringValue(`${this.value}`);
    }

    throw this.BadCastException(newType);
  }
}
