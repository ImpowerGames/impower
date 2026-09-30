import { parseLuau } from "../typecheck/DefinitionParser";
import { utf16Column } from "../typecheck/LuauDocumentChecker";

/** A syntax error's message and document range. */
export interface LuauStatementError {
  message: string;
  from: number;
  to: number;
}

/**
 * Luau's first syntax error for the statement that starts at `from`, as
 * Luau's parser reports it, with its range. The statement's line is read
 * first; while Luau's error is at the end of the text read, the text is
 * read on, whole lines at a time, to the next token, which is as far as
 * Luau reads before it reports a statement it cannot finish (`Hi, Bob` then
 * `end` reports `got 'end'` at the `end`). Null when Luau reads the line
 * without an error.
 */
export function luauStatementError(
  from: number,
  read: (from: number, to: number) => string,
): LuauStatementError | null {
  let to = endOfLine(from, read);
  for (let lines = 1; ; lines *= 2) {
    const text = read(from, to);
    const error = parseLuau(text).errors[0];
    if (!error) return null;
    const found = locate(error, text, from);
    let next = to;
    for (let i = 0; i < lines; i++) {
      if (read(next, next + 1) === "") break;
      next = endOfLine(next + 1, read);
    }
    if (found.from < from + text.trimEnd().length || next === to) {
      return found;
    }
    to = next;
  }
}

/** The document range of a Luau error in `text`, which starts at `from`. */
function locate(
  error: NonNullable<ReturnType<typeof parseLuau>["errors"][number]>,
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
