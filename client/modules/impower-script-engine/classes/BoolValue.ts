import { IValue } from "../types/IValue";
import { ValueType } from "../types/ValueType";
import { FloatValue } from "./FloatValue";
import { IntValue } from "./IntValue";
import { NullException } from "./NullException";
import { StringValue } from "./StringValue";
import { Value } from "./Value";

export const isBoolValue = (obj: unknown): obj is BoolValue => {
  const value = obj as BoolValue;
  return value.valueType === "Bool";
};

export class BoolValue extends Value<boolean> {
  constructor(val: boolean) {
    super(val || false);
  }

  public get isTruthy(): boolean {
    return Boolean(this.value);
  }

  public get valueType(): "Bool" {
    return "Bool";
  }

  public Cast(newType: ValueType): IValue {
    if (this.value === null) throw new NullException("Value.value");

    if (newType === this.valueType) {
      return this;
    }

    if (newType === "Int") {
      return new IntValue(this.value ? 1 : 0);
    }

    if (newType === "Float") {
      return new FloatValue(this.value ? 1.0 : 0.0);
    }

    if (newType === "String") {
      return new StringValue(this.value ? "true" : "false");
    }

    throw this.BadCastException(newType);
  }

  public toString(): string {
    return this.value ? "true" : "false";
  }
}
