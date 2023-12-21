export const combineValueMap = (
  valueMap: Record<string, Record<string, any>> | undefined,
  result: Record<string, Record<string, any>> = {}
) => {
  if (!valueMap) {
    return result;
  }
  Object.entries(valueMap).forEach(([k, v]) => {
    if (typeof v === "object") {
      Object.entries(v).forEach(([name, value]) => {
        result[k] ??= {};
        result[k]![name] = value;
      });
    } else {
      result[k] = v;
    }
  });

  return result;
};
