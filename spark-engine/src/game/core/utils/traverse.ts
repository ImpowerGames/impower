export const traverse = <T extends object>(
  obj: T,
  process: (fieldPath: string, fieldValue: unknown) => void,
  fieldPath: string = ""
) => {
  if (obj) {
    Object.entries(obj).forEach(([k, v]) => {
      if (typeof v === "object") {
        if (Array.isArray(v)) {
          process(`${fieldPath}.${k}`, v);
        } else {
          traverse(v, process, `${fieldPath}.${k}`);
        }
      } else {
        process(`${fieldPath}.${k}`, v);
      }
    });
  }
};
