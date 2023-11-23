export const traverse = <T>(
  obj: T,
  process: (fieldPath: string, fieldValue: unknown) => void,
  shouldProcess?: (fieldPath: string, fieldValue: unknown) => boolean,
  fieldPath: string = ""
) => {
  if (obj) {
    Object.entries(obj).forEach(([k, v]) => {
      const path = `${fieldPath}.${k}`;
      if (typeof v === "object") {
        if (Array.isArray(v)) {
          process(path, v);
        } else if (v && Object.keys(v).length === 0) {
          process(path, v);
        } else if (shouldProcess?.(path, v)) {
          process(path, v);
        } else {
          traverse(v, process, shouldProcess, path);
        }
      } else {
        process(path, v);
      }
    });
  }
};
