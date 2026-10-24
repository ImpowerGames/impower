/**
 * Luau's reserved words that begin a statement or close a block and begin no
 * expression. Where Luau expects an expression and finds one of these, it
 * reports the word as the expression it found missing (`Expected identifier
 * when parsing expression, got 'local'`).
 */
export const LUAU_STATEMENT_KEYWORDS: ReadonlySet<string> = new Set([
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "for",
  "local",
  "repeat",
  "return",
  "then",
  "until",
  "while",
]);
