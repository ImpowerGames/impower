// A variable, or a dotted path into one (`stats.health`), which is what the
// debug adapter's `evaluateRequest` reads from the evaluation context.
const EXPRESSION = /\b[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*/g;

/**
 * The columns of the expression the debug hover evaluates for a hover at
 * `character` on a line of `text` (#1845): the dotted path up to and
 * including the segment under the cursor, so hovering `stats` in
 * `stats.health` evaluates `stats` and hovering `health` evaluates
 * `stats.health`. None when the cursor is not on a name.
 */
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
    // The end of the segment the cursor is on.
    const next = text.indexOf(".", character);
    return { start, end: next >= 0 && next < end ? next : end };
  }
  return undefined;
};
