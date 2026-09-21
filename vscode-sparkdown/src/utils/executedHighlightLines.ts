/**
 * Adds the lines to highlight for a script's executed ranges (flattened
 * `[start, end, ...]`, sorted and merged) to `lines`: every executed line, and
 * the lines of a gap between two ranges when every line in it is blank or a
 * comment, so a run of executed lines reads as one.
 */
export const addExecutedHighlightLines = (
  lines: Set<number>,
  ranges: number[],
  lineText: (line: number) => string,
) => {
  for (let i = 0; i + 1 < ranges.length; i += 2) {
    const start = ranges[i]!;
    const end = ranges[i + 1]!;
    if (i > 0) {
      const gap: number[] = [];
      for (let line = ranges[i - 1]! + 1; line < start; line++) {
        const trimmed = lineText(line).trim();
        if (trimmed && !trimmed.startsWith("//")) {
          gap.length = 0;
          break;
        }
        gap.push(line);
      }
      for (const line of gap) {
        lines.add(line);
      }
    }
    for (let line = start; line <= end; line++) {
      lines.add(line);
    }
  }
};
