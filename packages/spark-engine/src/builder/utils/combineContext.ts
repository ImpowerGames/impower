const combineContext = (
  context: Record<string, Record<string, any>> | undefined,
  result: Record<string, Record<string, any>> = {}
) => {
  if (!context) {
    return result;
  }
  Object.entries(context).forEach(([k, v]) => {
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

export default combineContext;
