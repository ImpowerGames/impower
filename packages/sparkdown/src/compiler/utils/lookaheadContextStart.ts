/**
 * Where a reparse after an edit at `pos` has to begin in `text`, the
 * document before the edit (the same as the document after it up to `pos`).
 *
 * Grammar lookaheads read past the end of their own line: an operator at the
 * end of a line checks whether the next line begins a value, and an operator
 * with no operand is told apart from one whose operand is on a later line by
 * skipping blank lines and comments to the next token
 * (`_LUAU_TRIVIA_AHEAD_`). A token's node therefore depends on the text up
 * to the first line after it that holds anything but whitespace or a
 * comment. The incremental parser keeps every token before the point it
 * restarts from, so the reparse begins at the start of the last such line
 * before the edit: the tokens on it can read up to the edit, and a lookahead
 * from before it that skips blank lines and comments stops at that line. A
 * lookahead that scans on across a line of code (an interpolated string
 * field looking for its `{`) can still read past it.
 *
 * A line counts as skippable when it is blank, starts with `--` (a Luau
 * comment, or a story line Luau reads as one), or lies inside a comment
 * long bracket (`--[[` to `]]`) that spans lines. Counting a line as
 * skippable when Luau does not skip it only moves the start further back.
 */
export function lookaheadContextStart(text: string, pos: number): number {
  let start = lineStart(text, pos);
  while (start > 0) {
    const prev = lineStart(text, start - 1);
    const line = text.slice(prev, start).replace(/\r?\n$/, "");
    const opened = spanningCommentStart(text, prev, line);
    if (opened != null) {
      // The lines from the comment's opening to this one are inside it.
      start = lineStart(text, opened);
      if (text.slice(start, opened).trim() === "") continue;
      return start;
    }
    const trimmed = line.trimStart();
    if (trimmed === "" || trimmed.startsWith("--")) {
      start = prev;
      continue;
    }
    return prev;
  }
  return 0;
}

function lineStart(text: string, pos: number): number {
  return text.lastIndexOf("\n", pos - 1) + 1;
}

// The offset of a `--[[` (or `--[=[`...) on an earlier line that opens a
// comment a long-bracket close on `line` (which starts at `lineFrom`) ends,
// or null.
function spanningCommentStart(
  text: string,
  lineFrom: number,
  line: string,
): number | null {
  for (const match of line.matchAll(/\](=*)\]/g)) {
    const at = lineFrom + match.index;
    const level = match[1]!;
    // A long bracket ends at its first matching close, so the comment opens
    // at the earliest opener with no close between it and this one (an
    // opener inside the comment is part of its text).
    let opened: number | null = null;
    for (
      let open = text.lastIndexOf(`--[${level}[`, at);
      open >= 0 && text.indexOf(`]${level}]`, open) === at;
      open = open > 0 ? text.lastIndexOf(`--[${level}[`, open - 1) : -1
    ) {
      opened = open;
    }
    if (opened != null && opened < lineFrom) return opened;
  }
  return null;
}
