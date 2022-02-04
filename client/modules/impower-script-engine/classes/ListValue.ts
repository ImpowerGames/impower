import { ValueType } from "../types/ValueType";
import { FloatValue } from "./FloatValue";
import { ImpowerList } from "./ImpowerList";
import { ImpowerListItem } from "./ImpowerListItem";
import { ImpowerObject } from "./ImpowerObject";
import { IntValue } from "./IntValue";
import { NullException } from "./NullException";
import { StringValue } from "./StringValue";
import { Value } from "./Value";

export const isListValue = (obj: unknown): obj is ListValue => {
  const value = obj as ListValue;
  return value.valueType === "List";
};

export class ListValue extends Value<ImpowerList> {
  public get isTruthy(): boolean {
    if (this.value === null) {
      throw new NullException("this.value");
    }
    return this.value.Count > 0;
  }

  public get valueType(): "List" {
    return "List";
  }

  public Cast(newType: ValueType): Value<unknown> {
    if (this.value === null) {
      throw new NullException("Value.value");
    }

    if (newType === "Int") {
      const max = this.value.maxItem;
      if (max.Key.isNull) return new IntValue(0);
      return new IntValue(max.Value);
    }
    if (newType === "Float") {
      const max = this.value.maxItem;
      if (max.Key.isNull) return new FloatValue(0.0);
      return new FloatValue(max.Value);
    }
    if (newType === "String") {
      const max = this.value.maxItem;
      if (max.Key.isNull) return new StringValue("");

      return new StringValue(max.Key.toString());
    }

    if (newType === this.valueType) {
      return this;
    }

    throw this.BadCastException(newType);
  }

  constructor();

  constructor(list: ImpowerList);

  constructor(listOrSingleItem: ImpowerListItem, singleValue: number);

  constructor(
    listOrSingleItem?: ImpowerListItem | ImpowerList,
    singleValue?: number
  ) {
    super(null);

    if (!listOrSingleItem && !singleValue) {
      this.value = new ImpowerList();
    } else if (listOrSingleItem instanceof ImpowerList) {
      this.value = new ImpowerList(listOrSingleItem);
    } else if (
      listOrSingleItem instanceof ImpowerListItem &&
      typeof singleValue === "number"
    ) {
      this.value = new ImpowerList({
        Key: listOrSingleItem,
        Value: singleValue,
      });
    }
  }

  public static RetainListOriginsForAssignment(
    oldValue: ImpowerObject,
    newValue: ImpowerObject
  ): void {
    const oldList = oldValue as ListValue;
    const newList = newValue as ListValue;

    if (newList && newList.value === null) {
      throw new NullException("newList.value");
    }
    if (oldList && oldList.value === null) {
      throw new NullException("oldList.value");
    }

    // When assigning the empty list, try to retain any initial origin names
    if (oldList && newList && newList.value?.Count === 0)
      newList.value?.SetInitialOriginNames(oldList.value?.originNames);
  }
}
