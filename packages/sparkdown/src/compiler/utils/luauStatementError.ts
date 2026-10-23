import { readLuauStatementCandidate, luauPositionOffset, nextLuauToken } from "../typecheck/readLuauAst";
import type { SyntaxNode } from "@lezer/common";
import type { Location } from "../typecheck/Location";

/** A syntax error's message and document range. */
export interface LuauStatementError {
  message: string;
  from: number;
  to: number;
}

/**
 * Luau's syntax errors for the statement that starts at `from` and whose
 * syntax ends at `nodeEnd` (a table can span lines), every one as Luau's
 * parser reports it, in its words at its range (I-1489). The statement's
 * lines are read with the text after it up to the end of the line holding
 * the next token, however far that is, which is as far as Luau reads before
 * it reports a statement it cannot finish (`Hi, Bob` then `end` reports
 * `got 'end'` at the `end`) or reads on (`Hello` then `"x"` is a call).
 * When the statement takes that token too (`U.S.` then `Hi, Bob`) and an
 * error is at the end of the text read, the next token's line is read in
 * turn, and so on. The text read is cut from its block, so an error that
 * only the cut makes is no error of the statement's. `errors` is empty when
 * Luau reads the statement without an error. `to` is where Luau's reading
 * of the statements its lines hold ends, past `nodeEnd` when it reads on
 * into the lines after them (`Hi, Bob` then `1 + 2`, which are the
 * assignment's values).
 */
export function luauStatementErrors(
  node: SyntaxNode,
  from: number,
  read: (from: number, to: number) => string,
  nodeEnd: number = from,
  document: (() => string) | undefined = undefined,
): { errors: LuauStatementError[]; to: number } {
  // Production callers share the immutable document's text. The fallback is
  // for isolated callers, and reads it once, including look-ahead past this
  // candidate. Neither path builds a new document prefix on each iteration.
  let documentText: string;
  if (document) documentText = document();
  else {
    let root = node;
    for (let parent = root.parent; parent; parent = root.parent) root = parent;
    documentText = read(0, root.to);
  }
  let lineEnd = endOfLine(Math.max(from, nodeEnd - 1), read);
  read: for (;;) {
    const next = nextLuauToken(lineEnd, documentText);
    const to = next ? endOfLine(next.from + next.text.length, read) : lineEnd;
    const text = read(from, to);
    const result = readLuauStatementCandidate(node, documentText, from, to);
    const errors: LuauStatementError[] = [];
    for (const error of result.errors) {
      // The text read is cut from a block, so the block's own `end`,
      // `else`, `elseif` or `until` is one Luau's parser expects no more of
      // (`print(1)` then `else`): the statements before it are whole, and
      // Luau reads no further. A closer in the statement's own text is no
      // block's: the statement is a stray closer (`else`, or `x = 1 else`),
      // and Luau's error at it is the statement's (I-1504).
      const found = locate(error, documentText);
      if (BLOCK_KEYWORD_PAST_END.test(error.message) && found.from > from && found.from >= nodeEnd) break;
      // An error in a statement that starts after the one reported, which
      // the text read takes the start of and cuts short (`print(1); print(2)`
      // then `t`, whose `:m(1)` is on the line after), is that statement's.
      // An `Expected …, got '…'` error stands at the token the statement
      // before it could not take, which may begin the next statement
      // (`a.b.` then `local`); an incomplete statement's stands on it. One
      // the statement before ends short of is the next statement's own
      // (`Hello` then `1 + 2`, whose `1` begins no expression).
      let owner = statementHolding(
        result.root.body,
        error.location.begin,
        error.message.startsWith("Incomplete statement"),
      );
      const beginning = statementHolding(result.root.body, error.location.begin, true);
      if (owner && beginning !== owner && comesBefore(owner.location.end, error.location.end)) owner = beginning;
      if (owner) {
        const start = locate({ message: "", location: owner.location }, documentText).from;
        if (start > from && start >= nodeEnd) continue;
      }
      if (!next || found.from <= next.from) {
        errors.push(found);
        continue;
      }
      // The error is past the next token. When the last statement the
      // statement's lines hold ended before that token, the error is the
      // next statement's, which the text read cuts short (a `do` opened on
      // that line is unclosed). An earlier one on the line, ended
      // (`t.f(1); t.a, t.b` then `f(`), decides nothing.
      const last = lastStatementBefore(result.root.body, nodeEnd, documentText);
      if (!last || locate({ message: "", location: last.location }, documentText).to <= next.from) {
        continue;
      }
      // The statement took the next token; its error at the end of the text
      // is where the text was cut, so Luau reads on.
      if (found.from < from + text.trimEnd().length || to === lineEnd) {
        errors.push(found);
        continue;
      }
      lineEnd = to;
      continue read;
    }
    // Every statement that starts in the text the statement's own lines
    // hold is read from there (`t.f(1); t.a, t.b` then `1 + 2`, the
    // assignment's values); the reading ends where the last of them does.
    let end = nodeEnd;
    for (const statement of result.root.body) {
      const span = locate({ message: "", location: statement.location }, documentText);
      if (span.from < nodeEnd) end = Math.max(end, span.to);
    }
    return { errors, to: end };
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

/** The last of `statements` that starts before the offset `end`. */
function lastStatementBefore<T extends { location: Location }>(statements: T[], end: number, documentText: string): T | null {
  let last: T | null = null;
  for (const statement of statements) {
    if (locate({ message: "", location: statement.location }, documentText).from < end) last = statement;
  }
  return last;
}

/** Whether position `a` is before position `b`. */
function comesBefore(a: { line: number; column: number }, b: { line: number; column: number }): boolean {
  return a.line < b.line || (a.line === b.line && a.column < b.column);
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
