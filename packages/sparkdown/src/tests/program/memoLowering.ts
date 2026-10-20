// What the statement-memo tests read of an update's memo counts (#656,
// #1757): which statements it lowered that the incremental parse rebuilt
// none of. Imports nothing of the compiler, so a test that mocks lowerers and
// loads the compiler again (`programStatementMemo.test.ts`) can import it
// statically.
import type { MemoStats } from "../../compiler/lower/statementMemo";

/** Where the statement starting at `at` ends: before the first line after
 *  it, other than a blank one, indented no deeper than its first line, or
 *  past that line when it closes the statement (`end`, `else`). */
export const statementEnd = (text: string, at: number): number => {
  const lineStart = text.lastIndexOf("\n", at - 1) + 1;
  const indent = (line: string) => line.length - line.trimStart().length;
  const depth = indent(text.slice(lineStart, text.indexOf("\n", at)));
  let next = text.indexOf("\n", at) + 1;
  while (next > 0 && next < text.length) {
    const end = text.indexOf("\n", next);
    const line = text.slice(next, end < 0 ? text.length : end);
    if (line.trim() && indent(line) <= depth) {
      return /^(end|else|elseif|until)\b/.test(line.trim()) ? (end < 0 ? text.length : end) : next;
    }
    next = end + 1;
  }
  return text.length;
};

/** The first lines of the statements an update (`stats`) lowered that the
 *  incremental parse rebuilt none of, in `text`, the text the update made. */
export const loweredOutsideRebuilt = (stats: MemoStats, text: string): string[] => {
  const rebuilt = stats.rebuilt;
  const lineAt = (at: number) => text.slice(at, text.indexOf("\n", at)).trim();
  return stats.loweredAt
    .filter((at) => !rebuilt || at > rebuilt.to || statementEnd(text, at) <= rebuilt.from)
    .map(lineAt);
};
