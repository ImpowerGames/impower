import { RecursiveValidation } from "../types/RecursiveValidation";
import { getProperty } from "./getProperty";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export const populate = <T>(
  obj: T,
  validation: RecursiveValidation<T>
): void => {
  traverse(validation, (path, v) => {
    if (Array.isArray(v)) {
      const [defaultValue] = v;
      if (defaultValue !== undefined) {
        const val = getProperty(obj, path);
        if (val === undefined) {
          setProperty(obj, path, defaultValue);
        }
      }
    }
  });
};
