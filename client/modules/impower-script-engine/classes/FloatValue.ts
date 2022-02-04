import { ValueType } from "../types/ValueType";
import { BoolValue } from "./BoolValue";
import { IntValue } from "./IntValue";
import { NullException } from "./NullException";
import { StringValue } from "./StringValue";
import { Value } from "./Value";

export const isFloatValue = (obj: unknown): obj is FloatValue => {
  const value = obj as FloatValue;
  return value.valueType === "Float";
};

export class FloatValue extends Value<number> {
  constructor(val: number) {
    super(val || 0.0);
  }

  public get isTruthy(): boolean {
    return this.value !== 0.0;
  }

  public get valueType(): "Float" {
    return "Float";
  }

  public Cast(newType: ValueType): Value<unknown> {
    if (this.value === null) {
      throw new NullException("Value.value");
    }

    if (newType === this.valueType) {
      return this;
    }

    if (newType === "Bool") {
      return new BoolValue(this.value !== 0.0);
    }

    if (newType === "Int") {
      return new IntValue(this.value);
    }

    if (newType === "String") {
      return new StringValue(`${this.value}`);
    }

    throw this.BadCastException(newType);
  }
}
