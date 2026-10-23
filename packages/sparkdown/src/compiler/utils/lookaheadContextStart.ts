/**
 * Where a reparse after an edit at `pos` has to begin in `text`, the
 * document before the edit (the same as the document after it up to `pos`).
 *
 * No grammar regex reads past its own line: both engines match each one
 * against its line and line break only (I-1283). A rule left open at a line's
 * end still decides at a later line: an operator at the end of a line keeps
 * its rule open through blank lines and comments, and the first line after it
 * that holds anything but whitespace or a comment either carries its operand
 * or closes it. A token's node therefore depends on the text up to that line.
 * The incremental parser keeps every token before the point it restarts from,
 * so the reparse begins at the start of the last such line before the edit,
 * and a rule left open on it across the skipped lines is decided again from
 * the edited text.
 *
 * A line counts as skippable when it is blank, starts with `--` (a Luau
 * comment, or a story line Luau reads as one), or lies inside a comment
 * long bracket (`--[[` to `]]`) that spans lines; an edit inside such a
 * comment is in that comment's skipped text too. Every `--[[` counts as
 * opening one, even inside a string or another comment. Counting a line as
 * skippable when Luau does not skip it only moves the start further back.
 */
export function lookaheadContextStart(text: string, pos: number): number {
  const comments = longComments(text, pos);
  // The comment that opens on an earlier line and runs into the line that
  // starts at `lineFrom`, if any.
  const runningInto = (lineFrom: number) =>
    comments.findLast((c) => c.from < lineFrom && c.to > lineFrom);
  let start = lineStart(text, pos);
  for (;;) {
    // The lines from the comment's opening to this one are inside it.
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
  // `lastIndexOf` reads a negative start as 0, where it would find a line
  // break at offset 0 that comes after `pos`.
  return pos <= 0 ? 0 : text.lastIndexOf("\n", pos - 1) + 1;
}

function skippable(line: string): boolean {
  const trimmed = line.trim();
  return trimmed === "" || trimmed.startsWith("--");
}

// The spans before `pos` that may be comment long brackets (`--[[` to `]]`,
// `--[=[` to `]=]`...): one from every opener to its first matching close,
// whether or not the opener begins a comment. Without lexing the strings
// and line comments around them, an opener inside a string or another
// comment cannot be told from a real one, and skipping the text a false
// span covers could skip a real opener; keeping every span only moves the
// start further back. A span with no close before `pos` is still open there
// (`to` is infinite), and covers every later opener.
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
