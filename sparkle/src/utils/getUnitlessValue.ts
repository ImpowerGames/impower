export const getUnitlessValue = (
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
  let lastAlphaIndex: number | undefined;
  for (let i = v.length - 1; i >= 0; i -= 1) {
    const isNumberChar = !Number.isNaN(Number(v[i]));
    if (isNumberChar) {
      break;
    }
    lastAlphaIndex = i;
  }
  if (lastAlphaIndex != null) {
    return Number(v.slice(0, lastAlphaIndex));
  }
  return Number(v);
};
