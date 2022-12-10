export const setProperty = (
  obj: any,
  propertyPath: string,
  value: unknown
): boolean => {
  let success = false;
  let cur = obj;
  const parts = propertyPath.split(".");
  parts.forEach((part, partIndex) => {
    if (typeof cur === "object" && part) {
      if (partIndex === parts.length - 1) {
        cur[part] = value;
        success = true;
      } else {
        if (cur[part] == null) {
          cur[part] = {};
        }
        cur = cur[part];
      }
    }
  });
  return success;
};
