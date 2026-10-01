import type { SyntaxNode } from "@lezer/common";
import { lastSignificantLeaf } from "./lineContinuation";

// What the statement before a statement leaves for it to finish: a value
// after a line-ending `=` or operator, or a name after a line-ending `.`.
// Luau reads the next line as that value or name, and its missing part is
// reported where the statement before it ends, so the line itself is not
// reported again.

export const TRIVIA_BEFORE_STATEMENT: ReadonlySet<string> = new Set([
  "Newline",
  "ExtraWhitespace",
  "Whitespace",
  "OptionalWhitespace",
  "LuauComment",
  "LuauLineComment",
  "LuauBlockComment",
  "LuauDocLineComment",
]);

// Whether the statement before `start`, across blank and comment lines, ends
// with a word or an operator that a value must follow (`then`, `else`, `=`,
// `,`, `+`, `and`, an opening bracket). Luau reads the line at `start` as
// that value, and the missing value is already reported where the grammar
// ended the statement before it (`local y = if true then` then `1` at
// column 0).
export function followsMissingValue(
  start: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean {
  let prev = start.prevSibling;
  while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
  // Only a statement that takes a value; a block's header (`if x then`)
  // is followed by the block's statements.
  if (!prev || !VALUE_TAKING_STATEMENTS.has(prev.name)) return false;
  // Up to its last token, which leaves out the comments after it and never
  // mistakes a comment-like run inside a string for one (`[[--]]`).
  const last = lastSignificantLeaf(prev);
  if (!last) return false;
  return VALUE_EXPECTED_AT_END.test(read(prev.from, last.to).trimEnd());
}

const VALUE_TAKING_STATEMENTS: ReadonlySet<string> = new Set([
  "LuauVariableDefinition",
  "LuauSparkdownVariableDefinition",
  "LuauReassignment",
  "LuauAssignmentOperation",
  "LuauReturnStatement",
  "LuauPropertyDefinition",
]);

// A whole token, not the end of a longer one: `..` is not the end of `...`,
// nor `>` the end of an explicit instantiation's `>>`.
const VALUE_EXPECTED_AT_END =
  /(?:(?<![A-Za-z0-9_])(?:then|else|elseif|and|or|not|in)|[=,(\[{+\-*\/%^#]|(?<![<>])[<>]|(?<![.])\.\.)$/;

// Whether the statement before `start`, across blank and comment lines, ends
// with a `.` that no name follows on its line: a dangling access
// (`LuauDanglingAccessor`) or a line that is not a Luau statement ending in
// one (`Hello.`).
export function followsDanglingDot(
  start: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean {
  let prev = start.prevSibling;
  while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
  if (!prev) return false;
  if (prev.name === "LuauInvalidStatement") {
    const text = read(prev.from, prev.to).trimEnd();
    return text.endsWith(".") && !text.endsWith("..");
  }
  const cursor = prev.cursor();
  do {
    if (
      cursor.name === "LuauDanglingAccessor" &&
      read(cursor.to, prev.to).trim() === ""
    ) {
      return true;
    }
  } while (cursor.next() && cursor.from < prev.to);
  return false;
}
