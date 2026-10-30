import type { SyntaxNode } from "@lezer/common";
import { lastSignificantLeaf } from "./significantLeaf";

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

export function followsMissingValue(
  start: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean {
  let prev = start.prevSibling;
  while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
  if (!prev || !VALUE_TAKING_STATEMENTS.has(prev.name)) return false;
  const last = lastSignificantLeaf(prev);
  if (!last) return false;
  return VALUE_EXPECTED_TOKENS.has(read(last.from, last.to).trim());
}

const VALUE_TAKING_STATEMENTS: ReadonlySet<string> = new Set([
  "LuauVariableDefinition",
  "LuauSparkdownVariableDefinition",
  "LuauReassignment",
  "LuauAssignmentOperation",
  "LuauSparkdownAssignmentOperation",
  "LuauReturnStatement",
  "LuauPropertyDefinition",
]);

const VALUE_EXPECTED_TOKENS: ReadonlySet<string> = new Set([
  "then", "else", "elseif", "and", "or", "not", "in",
  "=", ",", "(", "[", "{", "+", "-", "*", "/", "%", "^", "#", "<", ">", "..",
  "+=", "-=", "*=", "/=", "//=", "%=", "^=", "..=", "==", "~=", "<=", ">=", "//",
]);

export function followsDanglingDot(
  start: SyntaxNode,
  read: (from: number, to: number) => string,
): boolean {
  let prev = start.prevSibling;
  while (prev && TRIVIA_BEFORE_STATEMENT.has(prev.name)) prev = prev.prevSibling;
  if (!prev) return false;
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
