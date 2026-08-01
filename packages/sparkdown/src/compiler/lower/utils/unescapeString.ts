/**
 * Resolve the backslash escapes in a string literal's inner text.
 *
 * The default arm returns the escaped character itself, so `\"` → `"`, `\\` →
 * `\`, and `\{` / `\}` → `{` / `}` — which is why this subsumes the
 * brace-only unescape the sparkle content path used to do on its own. That
 * partial version was the tell: escapes already half-existed, and the grammar
 * paints `\"` with `constant.character.escape.sd`, so the editor showed an
 * escape while the compiler printed the backslash on screen.
 *
 * Shared by all three struct lowerers, which each carried their own copy.
 */
export function unescapeString(s: string): string {
  return s.replace(/\\(.)/g, (_m, c: string) => {
    switch (c) {
      case "n":
        return "\n";
      case "r":
        return "\r";
      case "t":
        return "\t";
      case "b":
        return "\b";
      case "f":
        return "\f";
      case "v":
        return "\v";
      case "0":
        return "\0";
      default:
        return c; // \\  \"  \{  and any other escaped char → the literal char
    }
  });
}
