export const deleteProperty = (obj: any, propertyPath: string): boolean => {
  let success = false;
  let cur = obj;
  const parts = propertyPath.split(".");
  parts.forEach((part, partIndex) => {
    if (typeof cur === "object" && part) {
      if (partIndex === parts.length - 1) {
        delete cur[part];
        success = true;
      } else {
        if (cur[part] != null) {
          cur = cur[part];
        }
      }
    }
  });
  return success;
};
