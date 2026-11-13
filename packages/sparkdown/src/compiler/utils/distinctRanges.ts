export function distinctRanges<R extends { from: number; to: number; value: { type: unknown } }>(ranges: readonly R[]): R[] {
  const seen = new Set<string>();
  return ranges.filter((range) => {
    const key = `${range.from}:${range.to}:${JSON.stringify(range.value.type)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
