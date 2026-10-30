import { InkObject } from "./Object";
import { BoolValue, MultiValue, NullValue } from "./Value";
import { Void } from "./Void";

export function isLuauTruthy(obj: InkObject | null | undefined): boolean {
  if (obj == null) return false;
  if (obj instanceof NullValue) return false;
  if (obj instanceof Void) return false;
  if (obj instanceof BoolValue) return obj.value === true;
  if (obj instanceof MultiValue) {
    const first = obj.values[0];
    return first == null ? false : isLuauTruthy(first);
  }
  return true;
}
