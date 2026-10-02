// Tiny char-class-aware scanner over a regex source string. Used by
// rules that need to reason about top-level (non-character-class)
// content of a pattern — flagging `\s`, splitting top-level
// alternation branches, etc.
//
// Important properties: skips `\X` escapes wholesale, tracks `[...]`
// character classes (so `[\s]` doesn't count as "top-level \s"), and
// tracks `(...)` paren nesting so top-level `|` can be distinguished
// from group-internal `|`. Doesn't fully parse regex semantics — just
// enough to make conservative judgments.

export interface RegexToken {
  // Position in the source.
  index: number;
  // The token text (one char, an escape like `\s`, or a multi-char
  // construct like `(?=`).
  text: string;
  // True when the token sits inside a `[...]` character class.
  inCharClass: boolean;
  // Top-level group-nesting depth (0 = outside any group).
  groupDepth: number;
}

export function* scanRegex(source: string): Generator<RegexToken> {
  let i = 0;
  let inCharClass = false;
  let groupDepth = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
      // Escape — yield as a 2-char token if there's a follow char.
      const next = source[i + 1];
      const text = next === undefined ? "\\" : "\\" + next;
      yield { index: i, text, inCharClass, groupDepth };
      i += text.length;
      continue;
    }
    if (inCharClass) {
      if (ch === "]") {
        yield { index: i, text: ch, inCharClass, groupDepth };
        inCharClass = false;
        i++;
        continue;
      }
      yield { index: i, text: ch, inCharClass, groupDepth };
      i++;
      continue;
    }
    if (ch === "[") {
      yield { index: i, text: ch, inCharClass, groupDepth };
      inCharClass = true;
      i++;
      continue;
    }
    if (ch === "(") {
      // Detect non-capturing / lookaround prefixes so we can yield a
      // multi-char token rather than just `(`.
      const head = source.slice(i, i + 4);
      let text = ch;
      if (head.startsWith("(?:")) text = "(?:";
      else if (head.startsWith("(?=")) text = "(?=";
      else if (head.startsWith("(?!")) text = "(?!";
      else if (head.startsWith("(?<=")) text = "(?<=";
      else if (head.startsWith("(?<!")) text = "(?<!";
      else if (head.startsWith("(?<")) text = "(?<"; // (?<name>
      yield { index: i, text, inCharClass, groupDepth };
      groupDepth++;
      i += text.length;
      continue;
    }
    if (ch === ")") {
      yield { index: i, text: ch, inCharClass, groupDepth: groupDepth - 1 };
      if (groupDepth > 0) groupDepth--;
      i++;
      continue;
    }
    yield { index: i, text: ch, inCharClass, groupDepth };
    i++;
  }
}

// Split a regex source string at top-level `|`. "Top-level" means
// outside any `(...)` group AND outside any `[...]` character class.
// Each returned slice is `{ text, index }` — the substring and its
// starting offset in the original source.
export function splitTopLevelAlternation(
  source: string,
): { text: string; index: number }[] {
  const slices: { text: string; index: number }[] = [];
  let start = 0;
  for (const tok of scanRegex(source)) {
    if (
      tok.text === "|" &&
      !tok.inCharClass &&
      tok.groupDepth === 0
    ) {
      slices.push({ text: source.slice(start, tok.index), index: start });
      start = tok.index + 1;
    }
  }
  slices.push({ text: source.slice(start), index: start });
  return slices;
}

export type GroupKind =
  | "capture"
  | "non-capturing"
  | "named"
  | "lookahead"
  | "negative-lookahead"
  | "lookbehind"
  | "negative-lookbehind";

export interface RegexGroup {
  kind: GroupKind;
  // Offsets of the opening `(` and the closing `)` in the source.
  start: number;
  end: number;
  // The whole group, `(` through `)`.
  text: string;
  // The group's body, between its opener (`(`, `(?:`, `(?=`, ...) and `)`.
  body: string;
  // How many lookaround groups enclose this one.
  lookaroundDepth: number;
  // The innermost enclosing group, or null at top level.
  parent: RegexGroup | null;
}

const OPENERS: [string, GroupKind][] = [
  ["(?<=", "lookbehind"],
  ["(?<!", "negative-lookbehind"],
  ["(?=", "lookahead"],
  ["(?!", "negative-lookahead"],
  ["(?:", "non-capturing"],
  ["(?<", "named"],
  ["(?P<", "named"],
];

export function isLookaround(kind: GroupKind): boolean {
  return (
    kind === "lookahead" ||
    kind === "negative-lookahead" ||
    kind === "lookbehind" ||
    kind === "negative-lookbehind"
  );
}

// Every closed group in a regex source, in order of their closing `)`.
// Escapes and character classes are skipped as `scanRegex` does; an
// unbalanced `)` is ignored and an unclosed `(` is dropped.
export function regexGroups(source: string): RegexGroup[] {
  const groups: RegexGroup[] = [];
  const open: { kind: GroupKind; start: number; bodyStart: number }[] = [];
  // Groups are only known once closed, so parents are linked afterwards
  // through the open stack's start offsets.
  const byStart = new Map<number, RegexGroup>();
  const parentStart = new Map<number, number | null>();
  for (const tok of scanRegex(source)) {
    if (tok.inCharClass) continue;
    if (tok.text.startsWith("(")) {
      let kind: GroupKind = "capture";
      let opener = "(";
      for (const [prefix, k] of OPENERS) {
        if (source.startsWith(prefix, tok.index)) {
          kind = k;
          opener = prefix;
          break;
        }
      }
      const bodyStart =
        kind === "named"
          ? Math.max(source.indexOf(">", tok.index) + 1, tok.index + 1)
          : tok.index + opener.length;
      parentStart.set(tok.index, open.at(-1)?.start ?? null);
      open.push({ kind, start: tok.index, bodyStart });
    } else if (tok.text === ")") {
      const top = open.pop();
      if (!top) continue;
      const lookaroundDepth = open.filter((g) => isLookaround(g.kind)).length;
      const group: RegexGroup = {
        kind: top.kind,
        start: top.start,
        end: tok.index,
        text: source.slice(top.start, tok.index + 1),
        body: source.slice(top.bodyStart, tok.index),
        lookaroundDepth,
        parent: null,
      };
      byStart.set(top.start, group);
      groups.push(group);
    }
  }
  for (const group of groups) {
    const ps = parentStart.get(group.start);
    group.parent = ps == null ? null : (byStart.get(ps) ?? null);
  }
  return groups;
}
