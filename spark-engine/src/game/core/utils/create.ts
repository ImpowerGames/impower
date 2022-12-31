import { deepCopy } from "./deepCopy";
import { setProperty } from "./setProperty";
import { traverse } from "./traverse";

export const create = <T>(defaultObj: T): T => {
  const obj = {};
  traverse(defaultObj, (path, defaultValue) => {
    if (defaultValue !== undefined) {
      const copy = defaultValue == null ? null : deepCopy(defaultValue);
      setProperty(obj, path, copy);
    }
  });
  return obj as T;
};
