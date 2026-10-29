// Luau's reserved words, which are never a name. A module of its own so that
// code with no compiler in it (the Game Preview's starting values, which the
// player's page reads) can ask without loading the syntax tree's modules.
export const RESERVED: ReadonlySet<string> = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);
