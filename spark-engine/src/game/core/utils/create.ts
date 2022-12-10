import { RecursiveValidation } from "../types/RecursiveValidation";
import { deepCopy } from "./deepCopy";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export const create = <T>(validation: RecursiveValidation<T>): T => {
  const obj = {};
  traverse(validation, (path, v) => {
    if (Array.isArray(v)) {
      const [defaultValue] = v;
      if (defaultValue !== undefined) {
        const copy = defaultValue == null ? null : deepCopy(defaultValue);
        setProperty(obj, path, copy);
      }
    }
  });
  return obj as T;
};
