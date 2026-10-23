// Whether formatting `before` into `after` lost, added or joined a token.
// Whitespace may change freely, and the formatter's own rewrites of other
// text are allowed: single quotes to double quotes, a table's trailing comma,
// and `else if ... end end` folding to `elseif ... end`. Everything else must
// keep its non-whitespace text, and two tokens a space kept apart must not be
// written together (`-> two then` → `-> twothen`, `- -x` → `--x`).

// Character pairs that read as one longer token when nothing separates them.
const JOINING_PAIRS = new Set([
  "--",
  "..",
  "==",
  "~=",
  "<=",
  ">=",
  "//",
  "::",
  "->",
  "[[",
  "]]",
  "[=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^=",
]);

const NAME_CHAR = /[\p{L}\p{N}_]/u;
const ELSE_IF = /\belse\s+if\b/g;
const END = /\bend\b/g;

function joins(prev: string, next: string): boolean {
  if (NAME_CHAR.test(next) && (NAME_CHAR.test(prev) || prev === ")" || prev === "]")) {
    return true;
  }
  return JOINING_PAIRS.has(prev + next);
}

// The text with the formatter's own rewrites applied, as a list of
// non-whitespace characters, each marked with whether whitespace came before.
function canonical(text: string) {
  const normalized = text
    .replace(/\\'/g, "'")
    .replace(/'/g, '"')
    .replace(/,(\s*)\}/g, "$1}")
    .replace(ELSE_IF, "elseif")
    .replace(END, "");
  const chars: string[] = [];
  const spaced: boolean[] = [];
  let space = false;
  for (const c of normalized) {
    if (/\s/.test(c)) {
      space = true;
      continue;
    }
    chars.push(c);
    spaced.push(space);
    space = false;
  }
  return { chars, spaced };
}

const count = (text: string, regex: RegExp) => text.match(regex)?.length ?? 0;

/** The first token change from `before` to `after`, or undefined. */
export function tokenChange(before: string, after: string): string | undefined {
  const folded = count(before, ELSE_IF) - count(after, ELSE_IF);
  const dropped = count(before, END) - count(after, END);
  if (dropped !== folded) {
    return `${dropped} end keyword(s) removed for ${folded} else-if fold(s)`;
  }
  const a = canonical(before);
  const b = canonical(after);
  const context = (chars: string[], i: number) =>
    JSON.stringify(chars.slice(Math.max(0, i - 20), i + 20).join(""));
  const length = Math.min(a.chars.length, b.chars.length);
  for (let i = 0; i < length; i++) {
    if (a.chars[i] !== b.chars[i]) {
      return `text changed: ${context(a.chars, i)} → ${context(b.chars, i)}`;
    }
    if (i > 0 && a.spaced[i] && !b.spaced[i] && joins(a.chars[i - 1]!, a.chars[i]!)) {
      return `tokens joined: ${context(a.chars, i)}`;
    }
  }
  if (a.chars.length !== b.chars.length) {
    return `text changed at the end: ${context(a.chars, length)} → ${context(b.chars, length)}`;
  }
  return undefined;
}
