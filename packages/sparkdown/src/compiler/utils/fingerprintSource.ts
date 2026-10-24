import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { createSparkdownParser } from "./createSparkdownParser";

/** A range of a script's text, as offsets into it. */
export interface TextRange {
  from: number;
  to: number;
}

// What a fingerprint reads a rule of the grammar as.
const RULE = 1;
const COMMENT = 2;
const STRING = 4;
const MARKUP = 8;
const WHITESPACE = 16;
const SEPARATOR = 32;
const LUAU = 64;

/** The grammar's rules, by name, as a fingerprint reads them by their
 *  TextMate scope (`name`): a comment, which it leaves out; a string, whose
 *  text it keeps as written; the markup of displayed text (a word, a space,
 *  a punctuation mark), whose whitespace it keeps as written; and
 *  whitespace (`punctuation.whitespace`), of which all but a line end
 *  separates tokens, even inside a string. A tag (`#tag`), whose scopes name
 *  a comment and a tag, is no comment: the program carries its text, which
 *  is kept as a string's is. The grammar's Luau, whose spacing is logic's,
 *  is its rules named `Luau…`. */
const KINDS = new Map<string, number>();
for (const [name, rule] of Object.entries(
  GRAMMAR_DEFINITION.repository as Record<string, { name?: string }>,
)) {
  const scopes = rule.name?.split(" ") ?? [];
  const scope = scopes[0] ?? "";
  let kind = RULE | (name.startsWith("Luau") ? LUAU : 0);
  if (
    scope.startsWith("string.") ||
    scopes.some((s) => s.startsWith("entity.tag."))
  ) {
    kind |= STRING;
  } else if (scope.startsWith("comment.")) {
    kind |= COMMENT;
  } else if (scope.startsWith("markup.")) {
    kind |= MARKUP;
  } else if (scope.startsWith("punctuation.whitespace.")) {
    kind |= WHITESPACE;
    if (!scope.startsWith("punctuation.whitespace.newline.")) {
      kind |= SEPARATOR;
    }
  }
  KINDS.set(name, kind);
}

// Luau's whitespace, which a run of between two tokens is: a space, `\t`,
// `\n`, `\v`, `\f` or `\r`.
const isWhitespace = (code: number): boolean =>
  code === 32 || (code >= 9 && code <= 13);

const WORD = /[\p{L}\p{N}_]/u;

/** The pairs of operator characters that read as another operator when
 *  written together. */
const JOINED = new Set([
  "--",
  "..",
  "==",
  "<=",
  ">=",
  "~=",
  "//",
  "::",
  "[[",
  "]]",
  "[=",
  "=]",
  "->",
  "<-",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "^=",
  "=>",
  "!=",
  "&&",
  "||",
  "<<",
  ">>",
]);

/** Whether the space between two tokens, the one ending in `before` and the
 *  one starting with `after`, is kept: between two words, and between two
 *  operators that would otherwise read as another. */
const keepsSpace = (before: string, after: string): boolean =>
  (WORD.test(before) && WORD.test(after)) || JOINED.has(before + after);

/**
 * The text a fingerprint hashes of `text` between `from` and `to`, read from
 * `tree`, the parse of `text` (docs/engine/binary-program.md, section 1).
 *
 * Every comment the grammar reads is left out. The text of every string the
 * grammar reads (a Luau string of any kind, a regex literal, a displayed
 * line's text, a choice's, a heading's, a tag) is kept as written, and so is
 * the spacing of what is displayed around it. A run of whitespace between
 * two tokens is kept as written:
 *
 * - where it holds a line end, when each part of it is inside a string and
 *   none separates tokens (a long string's lines, a `\z` escape's skipped
 *   whitespace; not a dialogue block's indentation);
 * - within a line, when each part of it is inside a string but for a
 *   separator, is displayed text's markup, or stands outside the grammar's
 *   Luau (the space after a divert's `->`, around a command in a displayed
 *   line).
 *
 * Any other run of whitespace, or a comment between two tokens, is one line
 * end where it holds one, and otherwise one space where dropping it would
 * join the tokens into others (two words, `local x`, or two operators that
 * read together as another, `- -2` against `--2`; `keepsSpace`), and nothing
 * elsewhere (`x=1`); so indentation, the spacing between the tokens of
 * logic, blank lines and the space at a line's end are left out. Each range
 * of `cuts` stands as one `\u0002`, for a body a block statement's own source
 * leaves out. Without a tree, the text is read as written.
 */
export const fingerprintSource = (
  tree: Tree | undefined,
  text: string,
  from: number,
  to: number,
  cuts: readonly TextRange[] = [],
): string => {
  if (!tree) {
    return text.slice(from, to).replace(/\r\n/g, "\n");
  }
  let out = "";
  // The whitespace since the last token; whether all of it is a string's
  // own, and whether all of it is kept within a line; and whether a comment
  // or a cut stands in it.
  let gap = "";
  let stringGap = true;
  let lineGap = true;
  let broken = false;
  const token = (piece: string) => {
    if (out.length > 0 && (gap.length > 0 || broken)) {
      const lines = gap.includes("\n");
      if (!broken && (lines ? stringGap : lineGap)) {
        out += gap;
      } else if (lines) {
        out += "\n";
      } else if (keepsSpace(out[out.length - 1]!, piece[0]!)) {
        out += " ";
      }
    }
    gap = "";
    stringGap = true;
    lineGap = true;
    broken = false;
    out += piece;
  };
  // How many strings the text being read is part of, the kind of the
  // innermost rule it is part of, and that of the innermost of those that
  // is not whitespace.
  let strings = 0;
  const rules: number[] = [];
  const contexts: number[] = [];
  // The text from `a` to `b`, a `\r\n` read as a `\n`.
  const read = (a: number, b: number) => {
    const end = Math.min(b, to);
    let i = Math.max(a, from);
    if (i >= end) {
      return;
    }
    const rule = rules[rules.length - 1] ?? 0;
    const context = contexts[contexts.length - 1];
    const string = strings > 0 && !(rule & SEPARATOR);
    const line =
      string ||
      (rule & MARKUP) !== 0 ||
      (context !== undefined && !(context & LUAU));
    while (i < end) {
      const at = i;
      if (isWhitespace(text.charCodeAt(i))) {
        while (i < end && isWhitespace(text.charCodeAt(i))) i += 1;
        let space = text.slice(at, i);
        if (space.includes("\r")) {
          space = space.replace(/\r\n/g, "\n");
        }
        gap += space;
        stringGap &&= string;
        lineGap &&= line;
      } else {
        while (i < end && !isWhitespace(text.charCodeAt(i))) i += 1;
        token(text.slice(at, i));
      }
    }
  };
  // The text from `a` to `b` outside the cuts, each cut it reaches standing
  // as one token.
  let cut = 0;
  const readOutsideCuts = (a: number, b: number) => {
    if (cuts.length === 0) {
      read(a, b);
      return;
    }
    while (a < b) {
      while (cut < cuts.length && cuts[cut]!.to <= a) {
        cut += 1;
      }
      const next = cuts[cut];
      if (!next || next.from >= b) {
        read(a, b);
        return;
      }
      if (next.from > a) {
        read(a, next.from);
      }
      if (a <= next.from) {
        token("\u0002");
      }
      a = Math.min(b, next.to);
    }
  };
  const push = (kind: number) => {
    if (kind & STRING) {
      strings += 1;
    }
    if (kind & RULE) {
      rules.push(kind);
      if (!(kind & WHITESPACE)) {
        contexts.push(kind);
      }
    }
  };
  const pop = (kind: number) => {
    if (kind & STRING) {
      strings -= 1;
    }
    if (kind & RULE) {
      rules.pop();
      if (!(kind & WHITESPACE)) {
        contexts.pop();
      }
    }
  };
  let at = from;
  // Whether to read a node's children: not for a node outside the range or
  // inside a cut, or for a comment, whose text is left out.
  const enter = (node: SyntaxNodeRef): boolean => {
    if (
      node.to <= from ||
      (cuts.length > 0 &&
        cuts.some((c) => c.from <= node.from && node.to <= c.to))
    ) {
      return false;
    }
    readOutsideCuts(at, node.from);
    at = Math.max(at, node.from);
    const kind = KINDS.get(node.name) ?? 0;
    if (kind & COMMENT) {
      broken = true;
      at = Math.max(at, node.to);
      return false;
    }
    push(kind);
    return true;
  };
  const leave = (node: SyntaxNodeRef) => {
    readOutsideCuts(at, node.to);
    at = Math.max(at, node.to);
    pop(KINDS.get(node.name) ?? 0);
  };
  // The walk starts at the node that holds `from`, or at the outermost
  // comment that does, inside the nodes that hold it, so that a range costs
  // what its own nodes do and not what the script's nodes before it do.
  let start = innermostAt(tree, from);
  const holders: SyntaxNode[] = [];
  for (let node = start.parent; node; node = node.parent) {
    holders.unshift(node);
  }
  const comment = holders.findIndex(
    (node) => (KINDS.get(node.name) ?? 0) & COMMENT,
  );
  if (comment >= 0) {
    start = holders[comment]!;
    holders.length = comment;
  }
  holders.forEach((node) => push(KINDS.get(node.name) ?? 0));
  const cursor = start.cursor();
  walk: while (cursor.from < to) {
    let entered = false;
    if (enter(cursor)) {
      if (cursor.firstChild()) {
        continue;
      }
      entered = true;
    }
    // Up to the next node to read: the next sibling of this node or of the
    // nearest node that holds it, each node left on the way. Nothing after
    // a node that reaches `to` is in the range.
    for (;;) {
      if (entered) {
        leave(cursor);
      }
      if (cursor.to >= to) {
        break walk;
      }
      if (cursor.nextSibling()) {
        break;
      }
      if (!cursor.parent()) {
        break walk;
      }
      entered = true;
    }
  }
  readOutsideCuts(at, to);
  return out;
};

// The top-level nodes of each tree a fingerprint has read, in order.
const topLevel = new WeakMap<Tree, SyntaxNode[]>();

/** The innermost node of `tree` that holds `pos`, or the top-level node
 *  after it when `pos` is between two, found through the tree's top-level
 *  nodes by bisection: a script's top node holds every statement, and
 *  stepping through them from the first costs a script of `n` statements
 *  `n` steps for each. */
const innermostAt = (tree: Tree, pos: number): SyntaxNode => {
  let nodes = topLevel.get(tree);
  if (!nodes) {
    nodes = [];
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
      nodes.push(node);
    }
    topLevel.set(tree, nodes);
  }
  // The last top-level node that starts at or before `pos`.
  let lo = 0;
  let hi = nodes.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (nodes[mid]!.from <= pos) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  const node = nodes[found];
  if (node && node.to > pos) {
    return node.resolveInner(pos, 1);
  }
  return nodes[found + 1] ?? tree.topNode;
};

/** The text a fingerprint hashes of `source` read alone, as the grammar
 *  reads a script that holds nothing else (`fingerprintSource`). */
export const normalizeSource = (source: string): string =>
  fingerprintSource(
    createSparkdownParser().parse(source),
    source,
    0,
    source.length,
  );
