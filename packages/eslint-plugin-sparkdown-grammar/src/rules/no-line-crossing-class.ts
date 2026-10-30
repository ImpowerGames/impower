import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex, type GrammarIndex } from "../utils/grammar-index.ts";
import { isScalar, isSequence, rangeInScalar, type YAMLNode } from "../utils/yaml-ast.ts";
import { type RegexGroup, regexGroups, scanRegex } from "../utils/regex-scan.ts";
import { siteLabel } from "./lookaround-needs-rival-comment.ts";

interface CharClass {
  start: number;
  end: number;
  text: string;
}

function charClasses(source: string): CharClass[] {
  const classes: CharClass[] = [];
  let start: number | null = null;
  for (const tok of scanRegex(source)) {
    if (tok.text === "[" && !tok.inCharClass) {
      start = tok.index;
    } else if (tok.text === "]" && tok.inCharClass && start !== null) {
      classes.push({ start, end: tok.index, text: source.slice(start, tok.index + 1) });
      start = null;
    }
  }
  return classes;
}

export function negatedClassMatchesLineBreak(text: string): boolean {
  if (!text.startsWith("[^")) return false;
  for (const flags of ["u", ""]) {
    try {
      return new RegExp(text, flags).test("\n");
    } catch {}
  }
  return false;
}

export function repeats(source: string, at: number): boolean {
  const ch = source[at];
  if (ch === "*" || ch === "+") return true;
  if (ch === "{") {
    const m = /^\{(\d*)(,(\d*))?\}/.exec(source.slice(at));
    if (!m) return false;
    if (m[2] === undefined) return Number(m[1]) > 1;
    return m[3] === "" || Number(m[3]) > 1;
  }
  return false;
}

function skipQuantifier(source: string, at: number): number {
  let i = at;
  const ch = source[i];
  if (ch === "*" || ch === "+" || ch === "?") {
    i++;
  } else if (ch === "{") {
    const m = /^\{\d*(,\d*)?\}/.exec(source.slice(i));
    if (!m) return at;
    i += m[0].length;
  } else {
    return at;
  }
  if (source[i] === "?") i++;
  return i;
}

export const isLookbehind = (g: RegexGroup) =>
  g.kind === "lookbehind" || g.kind === "negative-lookbehind";
export const isLookahead = (g: RegexGroup) =>
  g.kind === "lookahead" || g.kind === "negative-lookahead";

export function readsOnAfter(source: string, after: number, groups: RegexGroup[]): boolean {
  let i = skipQuantifier(source, after);
  for (;;) {
    if (i >= source.length) return false;
    const ch = source[i];
    if (ch !== ")" && ch !== "|") return true;
    const group = groups.filter((g) => g.start < i && g.end >= i).sort((a, b) => b.start - a.start)[0];
    if (!group) {
      return false;
    }
    if (isLookahead(group)) return false;
    i = skipQuantifier(source, group.end + 1);
  }
}

function crossesLine(source: string, cls: CharClass, groups: RegexGroup[]): boolean {
  if (!negatedClassMatchesLineBreak(cls.text)) return false;
  const enclosing = groups.filter((g) => g.start < cls.start && g.end > cls.end);
  if (enclosing.some(isLookbehind)) return false;
  const lookahead = enclosing.filter(isLookahead).sort((a, b) => b.start - a.start)[0];
  const repeatable = enclosing.filter((g) => !lookahead || g.start > lookahead.start);
  return (
    repeats(source, cls.end + 1) ||
    repeatable.some((g) => repeats(source, g.end + 1)) ||
    readsOnAfter(source, cls.end + 1, groups)
  );
}

export interface Expanded {
  text: string;
  rawOffset: number[];
  variables: string[][];
}

const REFERENCE = /\{\{([A-Za-z0-9_]+)\}\}/g;

function variableValue(value: YAMLNode | null): string | null {
  if (isScalar(value) && typeof value.value === "string") return value.value;
  if (isSequence(value)) {
    const entries = value.entries.map((entry) =>
      isScalar(entry) && entry.value !== null ? String(entry.value) : "",
    );
    return `\\b(?:${entries.join("|")})\\b`;
  }
  return null;
}

export function expand(source: string, index: GrammarIndex): Expanded {
  const out: Expanded = { text: "", rawOffset: [], variables: [] };
  const visit = (text: string, chain: string[], top: boolean) => {
    let last = 0;
    const push = (from: number, to: number) => {
      for (let i = from; i < to; i++) {
        out.text += text[i];
        out.rawOffset.push(top ? i : -1);
        out.variables.push(chain);
      }
    };
    for (const match of text.matchAll(REFERENCE)) {
      const name = match[1]!;
      const at = match.index!;
      push(last, at);
      last = at + match[0].length;
      const value = chain.includes(name) ? null : variableValue(index.variables.get(name)?.value ?? null);
      if (value === null) {
        push(at, last);
      } else {
        visit(value, [...chain, name], false);
      }
    }
    push(last, text.length);
  };
  visit(source, [], true);
  return out;
}

const { rule, find } = defineBaselinedRule(
  {
    type: "problem",
    docs: {
      description:
        "Disallow a negated character class that lets a pattern read past its line's break; add `\\r\\n` to the class.",
    },
    messages: {
      crosses: `{{site}}: \`{{cls}}\`{{from}} matches a line break and the pattern reads on past it, into the next line, which VS Code and the editor never show it and an incremental reparse does not redo. Add \`\\r\\n\` to the class. See GRAMMAR.md §11.5.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const findings: Finding[] = [];
    for (const site of index.patternSites) {
      if (site.owner.kind === "variable") continue;
      const expanded = expand(site.source, index);
      const groups = regexGroups(expanded.text);
      for (const cls of charClasses(expanded.text)) {
        const chain = expanded.variables[cls.start]!;
        if (!crossesLine(expanded.text, cls, groups)) continue;
        const raw = expanded.rawOffset[cls.start]!;
        findings.push({
          owner: site.owner.id,
          loc:
            raw >= 0
              ? rangeInScalar(context, site.scalar, raw, cls.text.length)
              : site.scalar.loc,
          messageId: "crosses",
          data: {
            site: siteLabel(site),
            cls: cls.text,
            from: chain.length > 0 ? ` (from variable ${chain.at(-1)})` : "",
          },
        });
      }
    }
    return findings;
  },
);

export { find };
export default rule;
