import { RecursiveValidation } from "../types/RecursiveValidation";
import { getProperty } from "./getProperty";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";
import { unlerp } from "./unlerp";

export const normalize = <T>(
  obj: T,
  validation: RecursiveValidation<T>
): void => {
  traverse(validation, (path, v) => {
    if (Array.isArray(v)) {
      const [defaultValue, range] = v;
      if (Array.isArray(range)) {
        const [min, max] = range;
        if (
          typeof defaultValue === "number" &&
          typeof min === "number" &&
          typeof max === "number"
        ) {
          const val = getProperty<number>(obj, path);
          setProperty(obj, path, unlerp(val, min, max));
        }
      }
    }
  });
};
