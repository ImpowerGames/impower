import type { MemoStats } from "../../compiler/lower/statementMemo";

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

export const loweredOutsideRebuilt = (stats: MemoStats, text: string): string[] => {
  const rebuilt = stats.rebuilt;
  const lineAt = (at: number) => text.slice(at, text.indexOf("\n", at)).trim();
  return stats.loweredAt
    .filter((at) => !rebuilt || at > rebuilt.to || statementEnd(text, at) <= rebuilt.from)
    .map(lineAt);
};
