export const getProperty = <T>(
  obj: any,
  propertyPath: string
): T | undefined => {
  if (!propertyPath) {
    return obj;
  }
  if (obj == null) {
    return undefined;
  }
  let cur = obj;
  const parts = propertyPath.split(".");
  parts.forEach((part) => {
    if (typeof cur === "object" && part) {
      cur = cur[part];
    }
  });
  return cur;
};
