const getProperty = <T>(obj: any, propertyPath: string): T => {
  if (!propertyPath) {
    return obj;
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

export default getProperty;
