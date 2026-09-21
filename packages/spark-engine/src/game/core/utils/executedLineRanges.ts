/**
 * Sorts inclusive line ranges, given flattened as `[start, end, ...]` in any
 * order, and merges those that overlap or touch.
 */
export const mergeLineRanges = (pairs: number[]): number[] => {
  const count = pairs.length >> 1;
  const order = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    order[i] = i << 1;
  }
  order.sort((a, b) => pairs[a]! - pairs[b]! || pairs[a + 1]! - pairs[b + 1]!);
  const merged: number[] = [];
  for (const at of order) {
    const start = pairs[at]!;
    const end = pairs[at + 1]!;
    const last = merged.length - 1;
    if (last > 0 && start <= merged[last]! + 1) {
      if (end > merged[last]!) {
        merged[last] = end;
      }
    } else {
      merged.push(start, end);
    }
  }
  return merged;
};

/** Every line the flattened inclusive ranges cover, in order. */
export const expandLineRanges = (ranges: number[]): number[] => {
  const lines: number[] = [];
  for (let i = 0; i + 1 < ranges.length; i += 2) {
    for (let line = ranges[i]!; line <= ranges[i + 1]!; line++) {
      lines.push(line);
    }
  }
  return lines;
};
