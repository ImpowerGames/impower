import { readLuauStatementCandidate, luauPositionOffset } from "../typecheck/readLuauAst";
import type { SyntaxNode } from "@lezer/common";
import type { Location } from "../typecheck/Location";
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
  node: SyntaxNode,
  from: number,
  read: (from: number, to: number) => string,
  nodeEnd: number = from,
): LuauStatementError | null {
  let lineEnd = endOfLine(Math.max(from, nodeEnd - 1), read);
  for (;;) {
    const next = nextSignificantToken(node, lineEnd, read);
    const to = next ? endOfLine(next.from + next.text.length, read) : lineEnd;
    const text = read(from, to);
    const documentText = read(0, to);
    const result = readLuauStatementCandidate(node, documentText, from, to);
    const error = result.errors[0];
    if (!error) return null;
    const found = locate(error, documentText);
    // The text read is cut from a block, so the block's own `end`, `else`,
    // `elseif` or `until` is one Luau's parser expects no more of
    // (`print(1)` then `else`): the statements before it are whole.
    if (BLOCK_KEYWORD_PAST_END.test(error.message)) {
      return null;
    }
    // An error in a statement that starts after the one reported, which the
    // text read takes the start of and cuts short (`print(1); print(2)` then
    // `t`, whose `:m(1)` is on the line after), is that statement's.
    // An `Expected …, got '…'` error stands at the token the statement
    // before it could not take, which may begin the next statement
    // (`a.b.` then `local`); an incomplete statement's stands on it.
    const owner = statementHolding(
      result.root.body,
      error.location.begin,
      error.message.startsWith("Incomplete statement"),
    );
    if (owner) {
      const start = locate({ message: "", location: owner.location }, documentText).from;
      if (start > from && start >= nodeEnd) return null;
    }
    if (!next || found.from <= next.from) return found;
    // The error is past the next token. When the statement ended before
    // that token, the error is the next statement's, which the text read
    // cuts short (a `do` opened on that line is unclosed).
    const first = result.root.body[0];
    if (!first || locate({ message: "", location: first.location }, documentText).to <= next.from) {
      return null;
    }
    // The statement took the next token; its error at the end of the text
    // is where the text was cut, so Luau reads on.
    if (found.from < from + text.trimEnd().length || to === lineEnd) return found;
    lineEnd = to;
  }
}

const BLOCK_KEYWORD_PAST_END = /^Expected <eof>, got '(?:end|else|elseif|until)'$/;

/** The last of `statements` that starts before `at`, or at it when `atStart`. */
function statementHolding<T extends { location: { begin: { line: number; column: number } } }>(
  statements: T[],
  at: { line: number; column: number },
  atStart: boolean,
): T | null {
  let holding: T | null = null;
  for (const statement of statements) {
    const begin = statement.location.begin;
    if (
      begin.line < at.line ||
      (begin.line === at.line && (begin.column < at.column || (atStart && begin.column === at.column)))
    ) {
      holding = statement;
    }
  }
  return holding;
}

/** The converter already reports document positions in UTF-16 units. */
function locate(
  error: {
    message: string;
    location: Location;
  },
  documentText: string,
): LuauStatementError {
  return {
    message: error.message,
    from: luauPositionOffset(error.location.begin, documentText),
    to: luauPositionOffset(error.location.end, documentText),
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
