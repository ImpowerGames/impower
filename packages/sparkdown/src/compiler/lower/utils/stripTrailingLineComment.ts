// Grammar value tokens whose match greedily spans to end-of-line, so any
// trailing `-- comment` / `// comment` ends up INSIDE the value node. Quoted
// value tokens (`StringFieldValue` / `StringFieldValueInterpolated`) are bounded
// by their quotes and must NOT be stripped — a `--`/`//` inside the quotes is
// legitimate content.
export const UNQUOTED_VALUE_NODES: ReadonlySet<string> = new Set([
  "StylingValue",
  "UnquotedStringFieldValue",
]);

// Strip a trailing line comment from an UNQUOTED struct/style value so it never
// leaks into the compiled value (e.g. `color = red -- swap later` → the invalid
// CSS value `red -- swap later`). Callers must gate on `UNQUOTED_VALUE_NODES`.
//
// Only a WHITESPACE-delimited marker is stripped, so hyphenated values
// (`auto-fill`), CSS custom props (`--foo`), and `http://…` URLs are preserved.
// `//` additionally requires a following space/EOL (URL-safe, matching the
// display line-comment rule — see `//` display line comments).
export function stripTrailingLineComment(text: string): string {
  return text.replace(/\s+(?:--|\/\/(?=\s|$)).*$/, "").trimEnd();
}
