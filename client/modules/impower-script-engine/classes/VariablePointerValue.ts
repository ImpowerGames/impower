import { IValue } from "../types/IValue";
import { ValueType } from "../types/ValueType";
import { NullException } from "./NullException";
import { Value } from "./Value";

export const isVariablePointerValue = (
  obj: unknown
): obj is VariablePointerValue => {
  const value = obj as VariablePointerValue;
  return value.valueType === "VariablePointer";
};

export class VariablePointerValue extends Value<string> {
  public _contextIndex: number;

  constructor(variableName: string, contextIndex = -1) {
    super(variableName);

    this._contextIndex = contextIndex;
  }

  public get contextIndex(): number {
    return this._contextIndex;
  }

  public set contextIndex(value: number) {
    this._contextIndex = value;
  }

  public get variableName(): string {
    if (this.value == null) {
      throw new NullException("Value.value");
    }
    return this.value;
  }

  public set variableName(value: string) {
    this.value = value;
  }

  public get valueType(): "VariablePointer" {
    return "VariablePointer";
  }

  public get isTruthy(): never {
    throw new Error(
      "Shouldn't be checking the truthiness of a variable pointer"
    );
  }

  override Copy(): VariablePointerValue {
    return new VariablePointerValue(this.variableName, this.contextIndex);
  }

  public Cast(newType: ValueType): IValue {
    if (newType === this.valueType) {
      return this;
    }

    throw this.BadCastException(newType);
  }

  public toString(): string {
    return `VariablePointerValue(${this.variableName})`;
  }
}
