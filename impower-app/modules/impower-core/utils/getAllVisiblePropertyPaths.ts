const getAllVisiblePropertyPaths = <T>(
  data: T,
  isPropertyVisible: (propertyPath: string, data: T) => boolean,
  createData: () => T
): string[] => {
  const result: string[] = [];
  const inspectedData = { ...(createData?.() || {}), ...data };
  const getPaths = (d: unknown, s: string): void => {
    if (!isPropertyVisible || isPropertyVisible(s, inspectedData)) {
      if (d && Array.isArray(d)) {
        for (let i = 0; i < d.length; i += 1) {
          const path = s ? `${s}.${i}` : i.toString();
          getPaths(d[i], path);
        }
      } else if (d && typeof d === "object") {
        Object.keys(d).forEach((p) => {
          const path = s ? `${s}.${p}` : p;
          const r = d as Record<string | number | symbol, unknown>;
          getPaths(r[p], path);
        });
      }
      result.push(s);
    }
  };
  getPaths(inspectedData, "");
  return result;
};

export default getAllVisiblePropertyPaths;
