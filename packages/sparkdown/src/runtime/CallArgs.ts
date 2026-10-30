import { InkObject } from "./Object";
import { AbstractValue, MultiValue, NullValue } from "./Value";
import { Void } from "./Void";

export function oneValue(value: AbstractValue): AbstractValue;
export function oneValue(value: AbstractValue | null): AbstractValue | null;
export function oneValue(value: InkObject): InkObject;
export function oneValue(value: InkObject | null): InkObject | null;
export function oneValue(value: InkObject | null): InkObject | null {
  if (value instanceof MultiValue) return value.values[0] ?? new NullValue();
  if (value instanceof Void) return new NullValue();
  return value;
}

export function spreadCallArgs(args: unknown[]): void {
  for (let k = 0; k < args.length; k++) {
    const a = args[k];
    if (a instanceof MultiValue) {
      if (k === args.length - 1) {
        args.splice(k, 1, ...a.values);
      } else {
        args[k] = a.values[0] ?? new NullValue();
      }
    } else if (a instanceof Void) {
      if (k === args.length - 1) {
        args.splice(k, 1);
      } else {
        args[k] = new NullValue();
      }
    }
  }
}
