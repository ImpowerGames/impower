export const traverse = <T>(
  obj: T,
  process: (fieldPath: string, fieldValue: any) => void,
  shouldProcess?: (fieldPath: string, fieldValue: any) => boolean,
  fieldPath: string = ""
) => {
  if (obj) {
    for (const [k, v] of Object.entries(obj)) {
      const path = fieldPath ? `${fieldPath}.${k}` : k;
      if (typeof v === "object" && v && !("$name" in v)) {
        if (Array.isArray(v)) {
          process(path, v);
          traverse(v, process, shouldProcess, path);
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
    }
  }
};
