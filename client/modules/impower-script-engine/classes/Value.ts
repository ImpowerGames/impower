import { AbstractValue } from "./AbstractValue";
import { NullException } from "./NullException";

export const isValue = (obj: unknown): obj is Value => {
  const value = obj as Value;
  return value.valueObject !== undefined;
};

export abstract class Value<
  T extends { toString: () => string } = { toString: () => string }
> extends AbstractValue {
  public value: T;

  constructor(val: T) {
    super();
    this.value = val;
  }

  public get valueObject(): T {
    return this.value;
  }

  public toString(): string {
    if (this.value === null) {
      throw new NullException("Value.value");
    }
    return this.value.toString();
  }
}
