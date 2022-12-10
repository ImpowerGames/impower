import { RecursivePartial } from "../types/RecursivePartial";
import { RecursiveValidation } from "../types/RecursiveValidation";
import { deepCopy } from "./deepCopy";
import { getProperty } from "./getProperty";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export const clone = <T>(
  obj: RecursivePartial<T>,
  validation: RecursiveValidation<T>
): T => {
  const newObj = {};
  traverse(validation, (path, v) => {
    if (Array.isArray(v)) {
      const [defaultValue] = v;
      if (defaultValue !== undefined) {
        const val = getProperty(obj, path);
        if (val !== undefined) {
          setProperty(newObj, path, val);
        } else {
          const copy =
            defaultValue == null ? defaultValue : deepCopy(defaultValue);
          setProperty(newObj, path, copy);
        }
      }
    }
  });
  return newObj as T;
};
