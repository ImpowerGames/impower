// The places a message names a line of the unit's Luau, each where its
// template puts it: the opener a missing closer closes, at the start
// (`Expected 'end' (to close 'function' at line 1), got ...`), Luau's
// suggestion after the token found, at the end (`; did you forget to close
// 'do' at line 2?`), and a type's earlier definition (`Redefinition of type
// 'T', previously defined at line 3`). Nothing else in a message is a line:
// the token found (`got "(to close 'function' at line 9)"`) and a string's
// text are the author's.
const LINE_REFERENCES = [
  /^(Expected '[^']*' \(to close '[^']*' at line )(\d+)(\))/,
  /(; did you forget to close \S+ at line )(\d+)(\?)$/,
  /^(Redefinition of type '[^']*', previously defined at line )(\d+)()$/,
];

/** A message with each 1-based line it names (`LINE_REFERENCES`) replaced by `line(n)`. */
export function withMessageLines(message: string, line: (n: number) => number): string {
  for (const pattern of LINE_REFERENCES) {
    message = message.replace(pattern, (_, before: string, n: string, after: string) => `${before}${line(Number(n))}${after}`);
  }
  return message;
}
