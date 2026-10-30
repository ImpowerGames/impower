export interface RegexToken {
  index: number;
  text: string;
  inCharClass: boolean;
  groupDepth: number;
}

export function* scanRegex(source: string): Generator<RegexToken> {
  let i = 0;
  let inCharClass = false;
  let groupDepth = 0;
  while (i < source.length) {
    const ch = source[i]!;
    if (ch === "\\") {
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
      const head = source.slice(i, i + 4);
      let text = ch;
      if (head.startsWith("(?:")) text = "(?:";
      else if (head.startsWith("(?=")) text = "(?=";
      else if (head.startsWith("(?!")) text = "(?!";
      else if (head.startsWith("(?<=")) text = "(?<=";
      else if (head.startsWith("(?<!")) text = "(?<!";
      else if (head.startsWith("(?<")) text = "(?<";
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
  start: number;
  end: number;
  text: string;
  body: string;
  lookaroundDepth: number;
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

export function regexGroups(source: string): RegexGroup[] {
  const groups: RegexGroup[] = [];
  const open: { kind: GroupKind; start: number; bodyStart: number }[] = [];
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
