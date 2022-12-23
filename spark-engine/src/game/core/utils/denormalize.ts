import { RecursiveValidation } from "../types/RecursiveValidation";
import { getProperty } from "./getProperty";
import { lerp } from "./lerp";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export const denormalize = <T>(
  obj: T,
  validation: RecursiveValidation<T>
): void => {
  traverse(validation, (path, v) => {
    if (Array.isArray(v)) {
      const [defaultValue, range, steps] = v;
      if (Array.isArray(range)) {
        const min = range?.[0];
        const max = range?.[range.length - 1];
        const step = steps?.[0];
        if (
          typeof defaultValue === "number" &&
          typeof min === "number" &&
          typeof max === "number"
        ) {
          const val = getProperty<number>(obj, path);
          if (val !== undefined) {
            const lerpedVal = lerp(val, min, max);
            const fractionDigits = step.toString().split(".")?.[1]?.length || 0;
            const roundedVal = Number(lerpedVal.toFixed(fractionDigits));
            setProperty(obj, path, roundedVal);
          }
        }
      }
    }
  });
};
