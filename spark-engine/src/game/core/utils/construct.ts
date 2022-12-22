import { RecursiveValidation } from "../types/RecursiveValidation";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export const construct = <T>(
  validation: RecursiveValidation<T>,
  fields: Record<string, { value: unknown }>
): T => {
  const obj = {};
  traverse(validation, (path, v) => {
    if (Array.isArray(v)) {
      const [defaultValue] = v;
      if (defaultValue !== undefined) {
        const field = fields[path];
        if (field === undefined) {
          setProperty(obj, path, defaultValue);
        } else {
          setProperty(obj, path, field.value);
        }
      }
    }
  });
  return obj as T;
};
