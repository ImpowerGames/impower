export const req = <T extends number>(
  val: T | undefined,
  ...fallbacks: (T | undefined)[]
): T => {
  if (val != null) {
    return val;
  }
  for (let i = 0; i < fallbacks.length; i += 1) {
    const val = fallbacks[i];
    if (val != null) {
      return val;
    }
  }
  return 0 as T;
};
