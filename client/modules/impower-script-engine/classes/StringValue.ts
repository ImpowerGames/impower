import { ValueType } from "../types/ValueType";
import { FloatValue } from "./FloatValue";
import { IntValue } from "./IntValue";
import { NullException } from "./NullException";
import { Value } from "./Value";

export const isStringValue = (obj: unknown): obj is StringValue => {
  const value = obj as StringValue;
  return value.valueType === "String";
};

export class StringValue extends Value<string> {
  public _isNewline: boolean;

  public _isInlineWhitespace: boolean;

  constructor(val: string) {
    super(val || "");

    this._isNewline = this.value === "\n";
    this._isInlineWhitespace = true;

    if (this.value === null) {
      throw new NullException("Value.value");
    }

    if (this.value.length > 0) {
      this.value.split("").every((c) => {
        if (c !== " " && c !== "\t") {
          this._isInlineWhitespace = false;
          return false;
        }

        return true;
      });
    }
  }

  public get valueType(): "String" {
    return "String";
  }

  public get isTruthy(): boolean {
    if (this.value === null) {
      throw new NullException("Value.value");
    }
    return this.value.length > 0;
  }

  public get isNewline(): boolean {
    return this._isNewline;
  }

  public get isInlineWhitespace(): boolean {
    return this._isInlineWhitespace;
  }

  public get isNonWhitespace(): boolean {
    return !this.isNewline && !this.isInlineWhitespace;
  }

  override Copy(): StringValue {
    const obj = new StringValue(this.value);
    return obj;
  }

  public Cast(newType: ValueType): Value<unknown> {
    if (newType === this.valueType) {
      return this;
    }

    if (newType === "Int") {
      const parsedInt = Number(this.value);
      if (!Number.isNaN(parsedInt)) {
        return new IntValue(parsedInt);
      }
      throw this.BadCastException(newType);
    }

    if (newType === "Float") {
      const parsedFloat = Number(this.value);
      if (!Number.isNaN(parsedFloat)) {
        return new FloatValue(parsedFloat);
      }
      throw this.BadCastException(newType);
    }

    throw this.BadCastException(newType);
  }
}
