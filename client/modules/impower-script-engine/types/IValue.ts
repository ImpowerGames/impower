import { ValueType } from "./ValueType";

export interface IValue {
  valueType: ValueType;

  isTruthy: boolean;

  valueObject: unknown;

  Cast: (newType: ValueType) => IValue;
}
