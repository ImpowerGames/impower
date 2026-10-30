import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import type { SyntaxNode, Tree } from "@lezer/common";

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

const HOLES = new Set([
  "LuauBacktickStringInterpolation",
  "LuauDoubleQuotedStringInterpolation",
  "LuauInterpolatedStringExpression",
  "LuauSparkdownExplicitInterpolatedStringExpression",
  "LuauFunctionCallShorthand",
  "LuauSparkdownExplicitFunctionCallShorthand",
]);

let parser: TextmateGrammarParser | undefined;

interface Unit {
  text: string;
  literal: boolean;
  spaced: boolean;
  broken: boolean;
  from: number;
  boundary: boolean;
  trailingComma?: boolean;
  node?: string;
}

interface Units {
  list: Unit[];
  tree: Tree;
}

const LUAU_CODE = new Set([
  "LuauFunctionDefinition",
  "LuauMethodDefinition",
  "LuauDefine",
  "LuauFunctionTypeDeclaration",
]);

function luauCode(tree: Tree, pos: number): number {
  let from = -1;
  for (let n: SyntaxNode | null = tree.resolveInner(pos, 1); n; n = n.parent) {
    if (LUAU_CODE.has(n.name)) from = n.from;
  }
  return from;
}

interface LiteralRange {
  to: number;
  atStart: boolean;
  atEnd: boolean;
  node: string;
}

type Frame =
  | { kind: "literal"; start: number; atStart: boolean; node: string }
  | { kind: "hole"; literal: { start: number; atStart: boolean } };

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

function withoutTrailingCommas(list: Unit[]): Unit[] {
  return list.filter((unit) => !unit.trailingComma);
}

const TABLE = /^Luau(?:SparkdownExplicit)?Table$/;

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
  if ((/\d/.test(prev) && next === ".") || (prev === "." && /\d/.test(next))) {
    return true;
  }
  return JOINING_PAIRS.has(prev + next);
}

export function tokenChange(before: string, after: string): string | undefined {
  const source = units(before);
  const a = withoutTrailingCommas(source.list);
  const b = withoutTrailingCommas(units(after).list);
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
