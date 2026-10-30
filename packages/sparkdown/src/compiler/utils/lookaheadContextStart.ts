export function lookaheadContextStart(text: string, pos: number): number {
  const comments = longComments(text, pos);
  const runningInto = (lineFrom: number) =>
    comments.findLast((c) => c.from < lineFrom && c.to > lineFrom);
  let start = lineStart(text, pos);
  for (;;) {
    const comment = runningInto(start);
    if (comment) {
      start = lineStart(text, comment.from);
      if (!skippable(text.slice(start, comment.from)) && !runningInto(start)) {
        return start;
      }
      continue;
    }
    if (start === 0) return 0;
    const prev = lineStart(text, start - 1);
    if (!skippable(text.slice(prev, start)) && !runningInto(prev)) {
      return prev;
    }
    start = prev;
  }
}

function lineStart(text: string, pos: number): number {
  return pos <= 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
}

function skippable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("--");
}

function longComments(text: string, pos: number): { from: number; to: number }[] {
  const comments: { from: number; to: number }[] = [];
  const opener = /--\[(=*)\[/g;
  for (let match = opener.exec(text); match && match.index < pos; match = opener.exec(text)) {
    const close = `]${match[1]}]`;
    const at = text.indexOf(close, match.index + match[0].length);
    if (at < 0 || at + close.length > pos) {
      comments.push({ from: match.index, to: Number.POSITIVE_INFINITY });
      break;
    }
    comments.push({ from: match.index, to: at + close.length });
  }
  return comments;
}
