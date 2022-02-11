import { IValue } from "../types/IValue";
import { ValueType } from "../types/ValueType";
import { NullException } from "./NullException";
import { Path } from "./Path";
import { Value } from "./Value";

export const isDivertTargetValue = (obj: unknown): obj is DivertTargetValue => {
  const value = obj as DivertTargetValue;
  return value.valueType === "DivertTarget";
};

export class DivertTargetValue extends Value<Path> {
  public get valueType(): "DivertTarget" {
    return "DivertTarget";
  }

  public get targetPath(): Path {
    if (this.value == null) {
      throw new NullException("Value.value");
    }
    return this.value;
  }

  public set targetPath(value: Path) {
    this.value = value;
  }

  public get isTruthy(): never {
    throw new Error("Shouldn't be checking the truthiness of a divert target");
  }

  override Copy(): DivertTargetValue {
    const obj = new DivertTargetValue(this.value);
    return obj;
  }

  public Cast(newType: ValueType): IValue {
    if (newType === this.valueType) {
      return this;
    }

    throw this.BadCastException(newType);
  }

  public toString(): string {
    return `DivertTargetValue(${this.targetPath})`;
  }
}
