const EXPRESSION = /\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g;

export const evaluatableExpressionRange = (
  text: string,
  character: number,
): { start: number; end: number } | undefined => {
  for (const m of text.matchAll(EXPRESSION)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (character < start || character > end) {
      continue;
    }
    const next = text.indexOf(".", character);
    return { start, end: next >= 0 && next < end ? next : end };
  }
  return undefined;
};
