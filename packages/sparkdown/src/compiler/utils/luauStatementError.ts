import { parseLuau } from "../typecheck/DefinitionParser";
import { utf16Column } from "../typecheck/LuauDocumentChecker";
import { nextSignificantToken } from "../lower/utils/validateAssignmentValue";

/** A syntax error's message and document range. */
export interface LuauStatementError {
  message: string;
  from: number;
  to: number;
}

/**
 * Luau's first syntax error for the statement that starts at `from` and
 * whose syntax ends at `nodeEnd` (a table can span lines), as Luau's parser
 * reports it, with its range. The statement's lines are read
 * with the text after it up to the end of the line holding the next token,
 * however far that is, which is as far as Luau reads before it reports a
 * statement it cannot finish (`Hi, Bob` then `end` reports `got 'end'` at
 * the `end`) or reads on (`Hello` then `"x"` is a call). When the statement
 * takes that token too (`U.S.` then `Hi, Bob`) and its error is at the end
 * of the text read, the next token's line is read in turn, and so on. Null
 * when Luau reads the statement without an error.
 */
export function luauStatementError(
  from: number,
  read: (from: number, to: number) => string,
  nodeEnd: number = from,
): LuauStatementError | null {
  let lineEnd = endOfLine(Math.max(from, nodeEnd - 1), read);
  for (;;) {
    const next = nextSignificantToken(lineEnd, read);
    const to = next ? endOfLine(next.from + next.text.length, read) : lineEnd;
    const text = read(from, to);
    const result = parseLuau(text);
    const error = result.errors[0];
    if (!error) return null;
    const found = locate(error, text, from);
    if (!next || found.from <= next.from) return found;
    // The error is past the next token. When the statement ended before
    // that token, the error is the next statement's, which the text read
    // cuts short (a `do` opened on that line is unclosed).
    const first = result.root.body[0];
    if (!first || locate({ message: "", location: first.location }, text, from).to <= next.from) {
      return null;
    }
    // The statement took the next token; its error at the end of the text
    // is where the text was cut, so Luau reads on.
    if (found.from < from + text.trimEnd().length || to === lineEnd) return found;
    lineEnd = to;
  }
}

/** The document range of a Luau error in `text`, which starts at `from`. */
function locate(
  error: {
    message: string;
    location: {
      begin: { line: number; column: number };
      end: { line: number; column: number };
    };
  },
  text: string,
  from: number,
): LuauStatementError {
  const lines = text.split("\n");
  const lineStarts: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  // Luau's columns count UTF-8 bytes; the document's count UTF-16 units.
  const at = (position: { line: number; column: number }) =>
    from +
    (lineStarts[position.line] ?? text.length) +
    utf16Column(lines[position.line] ?? "", position.column);
  return {
    message: error.message,
    from: at(error.location.begin),
    to: at(error.location.end),
  };
}

/** The position of the line break that ends the line `pos` is on, or of the end of the text. */
function endOfLine(pos: number, read: (from: number, to: number) => string): number {
  const CHUNK = 256;
  for (let at = pos; ; at += CHUNK) {
    const text = read(at, at + CHUNK);
    const nl = text.indexOf("\n");
    if (nl >= 0) return at + nl;
    if (text.length < CHUNK) return at + text.length;
  }
}
