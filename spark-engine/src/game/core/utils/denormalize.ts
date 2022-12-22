import { RecursiveValidation } from "../types/RecursiveValidation";
import { getProperty } from "./getProperty";
import { lerp } from "./lerp";
import { roundToNearestStep } from "./roundToNearestStep";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export const denormalize = <T>(
  obj: T,
  validation: RecursiveValidation<T>
): void => {
  traverse(validation, (path, v) => {
    if (Array.isArray(v)) {
      const [defaultValue, range] = v;
      if (Array.isArray(range)) {
        const [min, max, step] = range;
        if (
          typeof defaultValue === "number" &&
          typeof min === "number" &&
          typeof max === "number"
        ) {
          const val = getProperty<number>(obj, path);
          const lerpedVal = lerp(val, min, max);
          const roundedVal = roundToNearestStep(lerpedVal, step);
          setProperty(obj, path, roundedVal);
        }
      }
    }
  });
};
