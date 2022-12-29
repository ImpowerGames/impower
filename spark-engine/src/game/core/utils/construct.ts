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
      let index = 0;
      let itemPath = `${path}.${index}`;
      let itemField = fields[itemPath];
      if (Array.isArray(defaultValue) && itemField) {
        while (itemField) {
          setProperty(obj, itemPath, fields[itemPath]?.value);
          index += 1;
          itemPath = `${path}.${index}`;
          itemField = fields[itemPath];
        }
      } else {
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
