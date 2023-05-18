const trimEnd = (str: string, length: number) => {
  return str.slice(0, -length);
};

const getCssDurationMS = (
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
  const v = value.trim().toLowerCase();
  if (v === "none" || v === "infinity") {
    return Infinity;
  }
  const ms = v.endsWith("ms")
    ? Number(trimEnd(v, "ms".length))
    : v.endsWith("s")
    ? Number(trimEnd(v, "s".length)) * 1000
    : v.endsWith("min")
    ? Number(trimEnd(v, "min".length)) * 1000 * 60
    : v.endsWith("h")
    ? Number(trimEnd(v, "h".length)) * 1000 * 60 * 60
    : Number(v);
  return ms;
};

export default getCssDurationMS;
