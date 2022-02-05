import { BoolValue } from "../classes/BoolValue";
import { DivertTargetValue } from "../classes/DivertTargetValue";
import { FloatValue } from "../classes/FloatValue";
import { IntValue } from "../classes/IntValue";
import { List } from "../classes/List";
import { ListValue } from "../classes/ListValue";
import { Path } from "../classes/Path";
import { StringValue } from "../classes/StringValue";
import { Value } from "../classes/Value";
import { ValueType } from "../types/ValueType";

export const createValue = (
  val: unknown,
  preferredNumberType?: ValueType
): Value => {
  // This code doesn't exist in upstream and is simply here to enforce
  // the creation of the proper number value.
  // If `preferredNumberType` is not provided or if value doesn't match
  // `preferredNumberType`, this conditional does nothing.
  if (preferredNumberType) {
    if (
      preferredNumberType === ("Int" as ValueType) &&
      Number.isInteger(Number(val))
    ) {
      return new IntValue(Number(val));
    }
    if (preferredNumberType === ("Float" as ValueType) && !Number.isNaN(val)) {
      return new FloatValue(Number(val));
    }
  }

  if (typeof val === "boolean") {
    return new BoolValue(Boolean(val));
  }

  // https://github.com/y-lohse/inkjs/issues/425
  // Changed condition sequence, because Number('') is
  // parsed to 0, which made setting string to empty
  // impossible
  if (typeof val === "string") {
    return new StringValue(String(val));
  }
  if (Number.isInteger(Number(val))) {
    return new IntValue(Number(val));
  }
  if (!Number.isNaN(val)) {
    return new FloatValue(Number(val));
  }
  if (val instanceof Path) {
    return new DivertTargetValue(val as Path);
  }
  if (val instanceof List) {
    return new ListValue(val as List);
  }

  return null;
};
