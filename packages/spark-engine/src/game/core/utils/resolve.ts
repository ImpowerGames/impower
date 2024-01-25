import { getProperty } from "./getProperty";
import { setProperty } from "./setProperty";

export const resolve = <T>(obj: T) => {
  return _resolve(obj, obj);
};

export const _resolve = <T>(obj: T, root: any, fieldPath: string = "") => {
  if (obj) {
    Object.entries(obj).forEach(([k, v]) => {
      const path = `${fieldPath}.${k}`;
      if (typeof v === "object" && v) {
        if ("$type" in v && "$name" in v) {
          const accessor = `.${v.$type}.${v.$name}`;
          const ref = getProperty(root, accessor);
          if (v !== ref) {
            setProperty(root, path, ref);
          } else {
            _resolve(v, root, path);
          }
        } else {
          _resolve(v, root, path);
        }
      }
    });
  }
  return obj;
};
