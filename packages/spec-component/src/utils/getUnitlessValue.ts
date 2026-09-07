// Overloaded so a caller that supplies a default gets `number` back rather
// than `number | undefined`: with a default there is no path that returns
// undefined.
export function getUnitlessValue(
  value: string | null,
  defaultValue: number,
  emptyValue?: number,
): number;
export function getUnitlessValue(
  value: string | null,
  defaultValue?: number,
  emptyValue?: number,
): number | undefined;
export function getUnitlessValue(
  value: string | null,
  defaultValue?: number,
  emptyValue: number | undefined = defaultValue,
): number | undefined {
  if (value === "") {
    return emptyValue;
  }
  if (value === "auto") {
    return defaultValue;
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
}
