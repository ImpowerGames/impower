// Whether formatting `before` into `after` lost, added, split or joined a
// token. Whitespace between tokens may change freely. A string, as the
// grammar reads it, is compared whole, its whitespace included, except for
// the code its interpolations hold; a comment is compared whole with its
// whitespace collapsed. The formatter's own rewrites
// are allowed where they apply: a closed single-quoted string written with
// double quotes, a table's trailing comma before its `}`, and `else if …
// end end` folded to `elseif … end`. Two characters a space kept apart must
// not be written together (`-> two then` → `-> twothen`, `- -x` → `--x`),
// and a name or number must not be written apart (`12` → `1 2`).

import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import type { Tree } from "@lezer/common";

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

// The nodes whose text is the author's, whitespace included.
const LITERALS = new Set([
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauInterpolatedString",
  "LuauMultilineString",
  "LuauString",
  "LuauElementContentStringInterpolated",
  "LuauElementContentStringPlain",
  "LuauElementContentStringSingleQuoted",
  "StringFieldValue",
  "StringFieldValueInterpolated",
  "StringLiteral",
  "LuauComment",
  "LuauLineComment",
  "LuauBlockComment",
  "LuauDocLineComment",
  "LuauAttributeLineComment",
  "LuauStructBlockSlashComment",
  "LuauStructBlockValueComment",
  "SparkdownInlineComment",
  "SparkdownLineComment",
  "SparkleTrailingLineComment",
]);

// The code inside a literal: an interpolation's expression, and a value's
// `{{call}}` shorthand.
const HOLES = new Set([
  "LuauBacktickStringInterpolation",
  "LuauDoubleQuotedStringInterpolation",
  "LuauInterpolatedStringExpression",
  "LuauSparkdownExplicitInterpolatedStringExpression",
  "LuauFunctionCallShorthand",
  "LuauSparkdownExplicitFunctionCallShorthand",
]);

let parser: TextmateGrammarParser | undefined;

// One token of the comparison: a stretch of literal text whole, or any other
// character on its own, and whether whitespace came before it.
interface Unit {
  text: string;
  literal: boolean;
  spaced: boolean;
  // Where the unit begins, and whether a token of the parse begins there.
  from: number;
  boundary: boolean;
}

// A stretch of literal text: where it ends, whether it begins and ends at
// its literal's own edges, where the node may hold whitespace around it (a
// string holds the space after its closing quote), rather than at an
// interpolation, and whether it is a comment, whose whitespace is no value.
interface LiteralRange {
  to: number;
  atStart: boolean;
  atEnd: boolean;
  comment: boolean;
}

// The literal text of the parse, by where each stretch begins.
function literalRanges(tree: Tree): Map<number, LiteralRange> {
  const ranges = new Map<number, LiteralRange>();
  // The literal the walk is in, or a hole in it, innermost last.
  const stack: ("literal" | "hole")[] = [];
  let start = -1;
  let atStart = true;
  let comment = false;
  tree.iterate({
    enter(node) {
      const inLiteral = stack.at(-1) === "literal";
      if (!inLiteral && LITERALS.has(node.name)) {
        stack.push("literal");
        start = node.from;
        atStart = true;
        comment = node.name.includes("Comment");
      } else if (inLiteral && HOLES.has(node.name)) {
        if (node.from > start) {
          ranges.set(start, { to: node.from, atStart, atEnd: false, comment });
        }
        stack.push("hole");
      }
      return undefined;
    },
    leave(node) {
      const top = stack.at(-1);
      if (top === "literal" && LITERALS.has(node.name)) {
        if (node.to > start) {
          ranges.set(start, { to: node.to, atStart, atEnd: true, comment });
        }
        stack.pop();
      } else if (top === "hole" && HOLES.has(node.name)) {
        stack.pop();
        start = node.to;
        atStart = false;
      }
    },
  });
  return ranges;
}

function units(text: string): Unit[] {
  parser ??= new TextmateGrammarParser(GRAMMAR_DEFINITION as any);
  const tree = parser.parse(text);
  const ranges = literalRanges(tree);
  const result: Unit[] = [];
  let spaced = false;
  for (let i = 0; i < text.length; ) {
    const range = ranges.get(i);
    if (range) {
      let literal = text.slice(i, range.to);
      if (range.atStart) {
        const trimmed = literal.trimStart();
        if (trimmed.length < literal.length) spaced = true;
        literal = trimmed;
      }
      if (range.atEnd) literal = literal.trimEnd();
      // A comment may be re-indented, but text it gains or loses counts
      // (`if s -- note` with `then` joined onto it).
      if (range.comment) literal = literal.replace(/\s+/g, " ");
      result.push({ text: literal, literal: true, spaced, from: i, boundary: true });
      i = range.to;
      // Whitespace the literal's node held after it.
      spaced = range.atEnd && /\s$/.test(text.slice(i - 1, i));
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i)!);
    if (/\s/.test(char)) {
      spaced = true;
    } else {
      const before = tree.resolveInner(i, -1);
      const after = tree.resolveInner(i, 1);
      result.push({
        text: char,
        literal: false,
        spaced,
        from: i,
        boundary: before.to <= i || after.from >= i,
      });
      spaced = false;
    }
    i += char.length;
  }
  return result;
}

// The double-quoted form the formatter writes a closed single-quoted string
// in, or the text itself.
function quoted(unit: Unit): string {
  const { text } = unit;
  if (
    unit.literal &&
    text.length >= 2 &&
    text.startsWith("'") &&
    text.endsWith("'") &&
    !text.includes('"')
  ) {
    return `"${text.slice(1, -1).split("\\'").join("'")}"`;
  }
  return text;
}

// The units without a table's trailing comma: a `,` before a `}`.
function withoutTrailingCommas(list: Unit[]): Unit[] {
  return list.filter(
    (unit, i) =>
      unit.literal || unit.text !== "," || list[i + 1]?.text !== "}",
  );
}

// Whether the units from `i` spell the whole word `word`.
function wordAt(list: Unit[], i: number, word: string): boolean {
  const chars = [...word];
  for (let k = 0; k < chars.length; k++) {
    const unit = list[i + k];
    if (!unit || unit.literal || unit.text !== chars[k]) return false;
    if (k > 0 && unit.spaced) return false;
  }
  const first = list[i]!;
  const before = list[i - 1];
  const after = list[i + chars.length];
  const bounded = (unit: Unit | undefined, spaced: boolean) =>
    !unit || unit.literal || spaced || !NAME_CHAR.test(unit.text);
  return bounded(before, first.spaced) && bounded(after, after?.spaced ?? true);
}

function joins(prev: string, next: string): boolean {
  if (NAME_CHAR.test(next) && (NAME_CHAR.test(prev) || prev === ")" || prev === "]")) {
    return true;
  }
  return JOINING_PAIRS.has(prev + next);
}

/** The first token change from `before` to `after`, or undefined. */
export function tokenChange(before: string, after: string): string | undefined {
  const a = withoutTrailingCommas(units(before));
  const b = withoutTrailingCommas(units(after));
  const context = (list: Unit[], i: number) =>
    JSON.stringify(
      list
        .slice(Math.max(0, i - 12), i + 12)
        .map((u) => (u.spaced ? " " : "") + u.text)
        .join(""),
    );
  // `else if` folded to `elseif`, each of which leaves one `end` to drop.
  let folds = 0;
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i]!;
    const y = b[j]!;
    if (x.literal !== y.literal || quoted(x) !== quoted(y)) {
      if (folds > 0 && wordAt(a, i, "end")) {
        folds--;
        i += 3;
        continue;
      }
      return `text changed: ${context(a, i)} → ${context(b, j)}`;
    }
    if (i > 0 && j > 0 && !x.literal && !a[i - 1]!.literal) {
      const prev = a[i - 1]!.text;
      if (x.spaced && !y.spaced) {
        if (wordAt(a, i, "if") && wordAt(a, i - 4, "else")) {
          folds++;
        } else if (joins(prev, x.text)) {
          return `tokens joined: ${context(a, i)} → ${context(b, j)}`;
        }
      } else if (
        !x.spaced &&
        y.spaced &&
        !x.boundary &&
        NAME_CHAR.test(prev) &&
        NAME_CHAR.test(x.text)
      ) {
        return `token split: ${context(a, i)} → ${context(b, j)}`;
      }
    }
    i++;
    j++;
  }
  while (folds > 0 && wordAt(a, i, "end")) {
    folds--;
    i += 3;
  }
  if (i < a.length || j < b.length) {
    return `text changed at the end: ${context(a, i)} → ${context(b, j)}`;
  }
  return undefined;
}
