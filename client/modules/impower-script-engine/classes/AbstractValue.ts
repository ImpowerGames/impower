import { IValue } from "../types/IValue";
import { ValueType } from "../types/ValueType";
import { RuntimeObject } from "./RuntimeObject";
import { StoryException } from "./StoryException";

export abstract class AbstractValue extends RuntimeObject implements IValue {
  public abstract get valueType(): ValueType;

  public abstract get isTruthy(): boolean;

  public abstract get valueObject(): unknown;

  public abstract Cast(newType: ValueType): IValue;

  public BadCastException(targetType: ValueType): StoryException {
    return new StoryException(
      `Can't cast ${this.valueObject} from ${this.valueType} to ${targetType}`
    );
  }
}
