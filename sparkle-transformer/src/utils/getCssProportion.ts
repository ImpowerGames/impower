export const getCssProportion = (
  value: string | null,
  defaultValue: number,
  emptyValue = defaultValue
): number => {
  if (value === "") {
    return emptyValue;
  }
  if (value == null) {
    return defaultValue;
  }
  let v = value.trim();
  if (v.endsWith("%")) {
    return Number(v.slice(0, -1)) / 100;
  }
  return Number(v);
};
