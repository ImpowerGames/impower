export const getNumberValue = <T>(
  value: string | undefined,
  defaultValue: T = undefined as T
): number | T => {
  const numValue = Number(value);
  if (!Number.isNaN(numValue)) {
    return numValue;
  }
  return defaultValue;
};
