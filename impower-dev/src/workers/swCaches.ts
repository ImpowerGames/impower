export const getStaleCacheNames = (
  existing: readonly string[],
  keep: readonly string[],
) => existing.filter((name) => !keep.includes(name));
