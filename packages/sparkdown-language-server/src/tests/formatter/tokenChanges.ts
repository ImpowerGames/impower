// Whether formatting `before` into `after` lost, added, split or joined a
// token. Whitespace between tokens may change freely. A string, as the
// grammar reads it, is compared whole, its whitespace included, except for
// the code its interpolations hold; a comment is compared whole with its
// whitespace collapsed. The formatter's own rewrites
// are allowed where they apply: a closed single-quoted string written with
// double quotes, a parsed table's trailing comma before its own `}`, and an
// `else` whose body is one `if` folded to `elseif`, dropping that `if`'s own
// `end`. Two characters a space kept apart must
// not be written together (`-> two then` → `-> twothen`, `- -x` → `--x`), a
// token of the parse must not be written apart (`12` → `1 2`, `==` →
// `= =`), and a line break may go or come only inside Luau code (two story
// lines joined are one beat).

import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import type { SyntaxNode, Tree } from "@lezer/common";

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
  "LuauRegexLiteral",
  "RunQuotedPath",
  "RunUnquotedPath",
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
// character on its own, whether whitespace came before it, and whether that
// whitespace held a line break.
interface Unit {
  text: string;
  literal: boolean;
  spaced: boolean;
  broken: boolean;
  // Where the unit begins, and whether a token of the parse begins there.
  from: number;
  boundary: boolean;
  // A table's trailing comma: a `,` the table's own `}` follows.
  trailingComma?: boolean;
  // The node a literal unit is read from.
  node?: string;
}

// The units of a text and its parse.
interface Units {
  list: Unit[];
  tree: Tree;
}

// The constructs that hold only Luau, where a line break is a space: the
// formatter joins a block's header (`if t` then `[2] then`) and compacts an
// empty body there. Anywhere else a line can be a beat of the story.
const LUAU_CODE = new Set([
  "LuauFunctionDefinition",
  "LuauMethodDefinition",
  "LuauDefine",
  "LuauFunctionTypeDeclaration",
]);

// Where the outermost Luau-only construct around `pos` begins, or -1.
function luauCode(tree: Tree, pos: number): number {
  let from = -1;
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (LUAU_CODE.has(n.name)) from = n.from;
  }
  return from;
}

// A stretch of literal text: where it ends, whether it begins and ends at
// its literal's own edges, where the node may hold whitespace around it (a
// string holds the space after its closing quote), rather than at an
// interpolation, and the literal's node.
interface LiteralRange {
  to: number;
  atStart: boolean;
  atEnd: boolean;
  node: string;
}

// The literal the walk is in, and where its current stretch began, or an
// interpolation in it.
type Frame =
  | { kind: "literal"; start: number; atStart: boolean; node: string }
  | { kind: "hole"; literal: { start: number; atStart: boolean } };

// The literal text of the parse, by where each stretch begins.
function literalRanges(tree: Tree): Map<number, LiteralRange> {
  const ranges = new Map<number, LiteralRange>();
  const stack: Frame[] = [];
  tree.iterate({
    enter(node) {
      const top = stack.at(-1);
      if (top?.kind !== "literal" && LITERALS.has(node.name)) {
        stack.push({
          kind: "literal",
          start: node.from,
          atStart: true,
          node: node.name,
        });
      } else if (top?.kind === "literal" && HOLES.has(node.name)) {
        if (node.from > top.start) {
          ranges.set(top.start, {
            to: node.from,
            atStart: top.atStart,
            atEnd: false,
            node: top.node,
          });
        }
        stack.push({ kind: "hole", literal: top });
      }
      return undefined;
    },
    leave(node) {
      const top = stack.at(-1);
      if (top?.kind === "literal" && LITERALS.has(node.name)) {
        if (node.to > top.start) {
          ranges.set(top.start, {
            to: node.to,
            atStart: top.atStart,
            atEnd: true,
            node: top.node,
          });
        }
        stack.pop();
      } else if (top?.kind === "hole" && HOLES.has(node.name)) {
        stack.pop();
        // The literal's text goes on after the interpolation.
        top.literal.start = node.to;
        top.literal.atStart = false;
      }
    },
  });
  return ranges;
}

function units(text: string): Units {
  parser ??= new TextmateGrammarParser(GRAMMAR_DEFINITION as any);
  const tree = parser.parse(text);
  const ranges = literalRanges(tree);
  const list: Unit[] = [];
  let gap = "";
  for (let i = 0; i < text.length; ) {
    const range = ranges.get(i);
    if (range) {
      let literal = text.slice(i, range.to);
      if (range.atStart) {
        const trimmed = literal.trimStart();
        gap += literal.slice(0, literal.length - trimmed.length);
        literal = trimmed;
      }
      let held = "";
      if (range.atEnd) {
        const trimmed = literal.trimEnd();
        held = literal.slice(trimmed.length);
        literal = trimmed;
      }
      // A comment may be re-indented, but text it gains or loses counts
      // (`if s -- note` with `then` joined onto it).
      if (range.node.includes("Comment")) literal = literal.replace(/\s+/g, " ");
      list.push({
        text: literal,
        literal: true,
        spaced: gap.length > 0,
        broken: gap.includes("\n"),
        from: i,
        boundary: true,
        node: range.node,
      });
      i = range.to;
      // Whitespace the literal's node held after it.
      gap = held;
      continue;
    }
    const char = String.fromCodePoint(text.codePointAt(i)!);
    if (/\s/.test(char)) {
      gap += char;
    } else {
      const before = tree.resolveInner(i, -1);
      const after = tree.resolveInner(i, 1);
      list.push({
        text: char,
        literal: false,
        spaced: gap.length > 0,
        broken: gap.includes("\n"),
        from: i,
        boundary: before.to <= i || after.from >= i,
        trailingComma: char === "," && isTrailingComma(tree, text, i),
      });
      gap = "";
    }
    i += char.length;
  }
  return { list, tree };
}

// The double-quoted form the formatter writes a closed single-quoted Luau
// string in, or the text itself. Only a Luau string unescapes `\'`; a quoted
// `run` path keeps its backslash.
function quoted(unit: Unit): string {
  const { text } = unit;
  if (
    unit.node === "LuauSingleQuotedString" &&
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
  return list.filter((unit) => !unit.trailingComma);
}

const TABLE = /^Luau(?:SparkdownExplicit)?Table$/;

// Whether the `,` at `at` is a table's trailing comma: a field comes before
// it, and the next character after whitespace is the `}` that closes a table
// around the comma.
function isTrailingComma(tree: Tree, text: string, at: number): boolean {
  let before = at - 1;
  while (before >= 0 && /\s/.test(text[before]!)) before--;
  if (text[before] === "{") return false;
  const close = text.slice(at + 1).search(/\S/);
  if (close < 0 || text[at + 1 + close] !== "}") return false;
  const brace = at + 1 + close;
  for (let n: SyntaxNode | null = tree.resolveInner(at, 1); n; n = n.parent) {
    if (TABLE.test(n.name)) return n.to === brace + 1;
  }
  return false;
}

const ELSE_BLOCKS: Record<string, string> = {
  LuauElseBlock: "LuauIfBlock",
  LuauSparkdownElseBlock: "LuauSparkdownIfBlock",
};

const INSIGNIFICANT = new Set([
  "Newline",
  "Whitespace",
  "ExtraWhitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "TrailingWhitespace",
]);

// The else blocks the formatter may fold into `elseif`: an `else` whose body
// is one `if` and nothing else, by where that `if` keyword begins, each with
// where the inner `if`'s own `end` begins, the one the fold drops.
function foldableElses(tree: Tree): Map<number, number> {
  const folds = new Map<number, number>();
  tree.iterate({
    enter(node) {
      const inner = ELSE_BLOCKS[node.name];
      if (!inner) return;
      const body = node.node.getChild(`${node.name}_content`);
      let ifBlock: SyntaxNode | null = null;
      for (let child = body?.firstChild ?? null; child; child = child.nextSibling) {
        if (INSIGNIFICANT.has(child.name)) continue;
        if (child.name !== inner || ifBlock) return;
        ifBlock = child;
      }
      let ifFrom = -1;
      ifBlock?.getChild(`${inner}_begin`)?.cursor().iterate((n) => {
        if (n.name === "LuauIfKeyword") ifFrom = n.from;
        return ifFrom < 0;
      });
      let endFrom = -1;
      ifBlock?.getChild(`${inner}_end`)?.cursor().iterate((n) => {
        if (n.name === "LuauEndKeyword") endFrom = n.from;
        return endFrom < 0;
      });
      if (ifFrom >= 0 && endFrom >= 0) folds.set(ifFrom, endFrom);
    },
  });
  return folds;
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

// Whether `prev` and `next` read as one token once nothing separates them:
// two name characters, a name after a closing bracket, a joining pair, or a
// number and the point next to it (`1 .5` → `1.5`).
function joins(prev: string, next: string): boolean {
  if (NAME_CHAR.test(next) && (NAME_CHAR.test(prev) || prev === ")" || prev === "]")) {
    return true;
  }
  if ((/\d/.test(prev) && next === ".") || (prev === "." && /\d/.test(next))) {
    return true;
  }
  return JOINING_PAIRS.has(prev + next);
}

/** The first token change from `before` to `after`, or undefined. */
export function tokenChange(before: string, after: string): string | undefined {
  const source = units(before);
  const a = withoutTrailingCommas(source.list);
  const b = withoutTrailingCommas(units(after).list);
  // `else if` folded to `elseif` where the source's else holds only that if.
  // Each fold drops the inner if's `end`, which reads like the `end`s after
  // it, so the folds a comparison finds are taken out of the source and the
  // comparison runs again, until it finds no new one.
  const foldable = foldableElses(source.tree);
  const dropped = new Set<number>();
  for (;;) {
    const kept = a.filter(
      (unit) => ![...dropped].some((end) => unit.from >= end && unit.from < end + 3),
    );
    const { change, folds } = compare(kept, b, source.tree, foldable);
    const found = folds.filter((end) => !dropped.has(end));
    if (found.length === 0) return change;
    for (const end of found) dropped.add(end);
  }
}

// The first token change from the units `a` to `b`, and the inner `end`s of
// the else-if folds it met.
function compare(
  a: Unit[],
  b: Unit[],
  tree: Tree,
  foldable: Map<number, number>,
): { change: string | undefined; folds: number[] } {
  const folds: number[] = [];
  const context = (list: Unit[], i: number) =>
    JSON.stringify(
      list
        .slice(Math.max(0, i - 12), i + 12)
        .map((u) => (u.spaced ? " " : "") + u.text)
        .join(""),
    );
  const changed = (change: string) => ({ change, folds });
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const x = a[i]!;
    const y = b[j]!;
    if (x.literal !== y.literal || quoted(x) !== quoted(y)) {
      return changed(`text changed: ${context(a, i)} → ${context(b, j)}`);
    }
    if (i > 0 && j > 0) {
      const prev = a[i - 1]!;
      const fold =
        x.spaced &&
        !y.spaced &&
        foldable.has(x.from) &&
        wordAt(a, i, "if") &&
        wordAt(a, i - 4, "else");
      if (fold) {
        folds.push(foldable.get(x.from)!);
      } else if (x.broken !== y.broken) {
        // A line break goes or comes only inside Luau code, where it is a
        // space; elsewhere a line is a beat of the story.
        const code = luauCode(tree, prev.from);
        if (code < 0 || code !== luauCode(tree, x.from)) {
          return changed(
            `line ${x.broken ? "joined" : "broken"}: ${context(a, i)} → ${context(b, j)}`,
          );
        }
      }
      if (!fold && !x.literal && !prev.literal) {
        if (x.spaced && !y.spaced && joins(prev.text, x.text)) {
          return changed(`tokens joined: ${context(a, i)} → ${context(b, j)}`);
        }
        // Written apart where the parse reads one token (`==`, `1.5`, a
        // name).
        if (!x.spaced && y.spaced && !x.boundary) {
          return changed(`token split: ${context(a, i)} → ${context(b, j)}`);
        }
      }
    }
    i++;
    j++;
  }
  if (i < a.length || j < b.length) {
    return changed(`text changed at the end: ${context(a, i)} → ${context(b, j)}`);
  }
  return { change: undefined, folds };
}
