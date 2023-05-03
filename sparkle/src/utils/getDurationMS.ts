export const getDurationMS = (
  duration: string | null,
  defaultValue: number,
  emptyValue?: number
): number => {
  if (duration === "") {
    return emptyValue != null ? emptyValue : defaultValue;
  }
  if (duration == null) {
    return defaultValue;
  }
  const t = duration.trim();
  const ms = t.endsWith("ms")
    ? Number(t.replace("ms", ""))
    : t.endsWith("s")
    ? Number(t.replace("s", "")) * 1000
    : t.endsWith("min")
    ? Number(t.replace("min", "")) * 1000 * 60
    : t.endsWith("h")
    ? Number(t.replace("h", "")) * 1000 * 60 * 60
    : 0;
  return ms;
};
