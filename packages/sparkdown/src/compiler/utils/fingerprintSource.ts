import type { SyntaxNode, SyntaxNodeRef, Tree } from "@lezer/common";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { createSparkdownParser } from "./createSparkdownParser";
import { joinsAcrossSpace } from "./lexicalJoin";

export interface TextRange {
  from: number;
  to: number;
}

const RULE = 1;
const COMMENT = 2;
const STRING = 4;
const MARKUP = 8;
const WHITESPACE = 16;
const SEPARATOR = 32;
const LUAU = 64;

const kindOf = (name: string, scope: string | undefined): number => {
  const scopes = scope?.split(" ") ?? [];
  const first = scopes[0] ?? "";
  const rule = scope !== undefined || name in GRAMMAR_DEFINITION.repository;
  let kind = (rule ? RULE : 0) | (name.startsWith("Luau") ? LUAU : 0);
  if (
    first.startsWith("string.") ||
    scopes.some((s) => s.startsWith("entity.tag."))
  ) {
    kind |= STRING;
  } else if (first.startsWith("comment.")) {
    kind |= COMMENT;
  } else if (first.startsWith("markup.")) {
    kind |= MARKUP;
  } else if (first.startsWith("punctuation.whitespace.")) {
    kind |= WHITESPACE;
    if (!first.startsWith("punctuation.whitespace.newline.")) {
      kind |= SEPARATOR;
    }
  }
  return kind;
};

let kinds: Map<string, number> | undefined;

const kindsByName = (): Map<string, number> => {
  if (!kinds) {
    kinds = new Map();
    for (const node of createSparkdownParser().grammar.nodes) {
      const scope = node.props["name"];
      kinds.set(
        node.typeId,
        kindOf(node.typeId, typeof scope === "string" ? scope : undefined),
      );
    }
  }
  return kinds;
};

const isWhitespace = (code: number): boolean =>
  code === 32 || (code >= 9 && code <= 13);

const NORMALIZER_ONLY_JOINING_PAIRS = new Set([
  "]]",
  "=]",
  "<-",
  "=>",
  "!=",
  "&&",
  "||",
  "<<",
  ">>",
]);

const keepsSpace = (before: string, after: string): boolean =>
  joinsAcrossSpace(before, after) ||
  NORMALIZER_ONLY_JOINING_PAIRS.has(before + after);

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
  const KINDS = kindsByName();
  let out = "";
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
  let strings = 0;
  const rules: number[] = [];
  const contexts: number[] = [];
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
  const mark = () => {
    if (out.length > 0 && !out.endsWith("\n")) {
      out += "\n";
    }
    out += "\u0002";
    gap = "\n";
    stringGap = false;
    lineGap = false;
    broken = false;
  };
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
        mark();
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
      for (const c of cuts) {
        if (c.from >= at && c.from < node.to && c.from >= from && c.from < to) {
          mark();
        }
      }
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

const topLevel = new WeakMap<Tree, SyntaxNode[]>();

const innermostAt = (tree: Tree, pos: number): SyntaxNode => {
  let nodes = topLevel.get(tree);
  if (!nodes) {
    nodes = [];
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
      nodes.push(node);
    }
    topLevel.set(tree, nodes);
  }
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

export const normalizeSource = (source: string): string =>
  fingerprintSource(
    createSparkdownParser().parse(source),
    source,
    0,
    source.length,
  );
