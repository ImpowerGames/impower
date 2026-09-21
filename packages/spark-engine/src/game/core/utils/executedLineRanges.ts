/**
 * The lines as sorted inclusive ranges, with adjacent lines joined, flattened
 * as `[start, end, start, end, ...]`.
 */
export const lineRanges = (lines: Iterable<number>): number[] => {
  const sorted = Array.from(lines).sort((a, b) => a - b);
  const ranges: number[] = [];
  for (const line of sorted) {
    const last = ranges.length - 1;
    if (last > 0 && line <= ranges[last]! + 1) {
      if (line > ranges[last]!) {
        ranges[last] = line;
      }
    } else {
      ranges.push(line, line);
    }
  }
  return ranges;
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
