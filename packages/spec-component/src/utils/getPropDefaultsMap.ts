export const getPropDefaultsMap = <T extends Record<string, string>>(
  obj: T,
): Record<keyof T, unknown> =>
  Object.keys(obj).reduce(
    (prev, key) => {
      prev[key] = null;
      return prev;
    },
    {} as Record<string, unknown>,
  ) as Record<keyof T, unknown>;
