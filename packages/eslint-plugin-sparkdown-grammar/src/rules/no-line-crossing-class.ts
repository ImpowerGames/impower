// Rule: GRAMMAR.md §11.5, "no single `begin:`, `end:`, or `match:`
// pattern can extend past that `\n` into the next line's content". A
// negated character class such as `[^()]` also matches a line break, so
// a pattern that repeats it, or reads on after it, can read the lines
// below its own: VS Code and the web editor, which hand the tokenizer
// one line at a time, never see them, and an incremental reparse keeps
// the token although an edit on a later line changes what the pattern
// read (#1583). Adding `\r\n` to the class keeps it on its line.
//
// Each rule's `match`, `begin` and `end` is checked with its `{{NAME}}`
// references expanded, since a class and the repetition that carries it
// over the break can sit on either side of a variable reference. A class
// that matches `\n` is reported when it is repeated (`*`, `+`,
// `{n,}`), sits in a repeated group, or has more pattern after it before
// its lookahead or the whole pattern ends. A class whose match can only be
// the line's own break (`(?=[^{])`) passes, and so does a class inside a
// lookbehind, which reads backwards. A variable that reads past the line
// on purpose carries a `# reads-past-line:` comment saying why, and the
// classes it brings into a pattern are not reported.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex, type GrammarIndex, markedComment } from "../utils/grammar-index.ts";
import { isScalar, isSequence, rangeInScalar, type YAMLNode } from "../utils/yaml-ast.ts";
import { type RegexGroup, regexGroups, scanRegex } from "../utils/regex-scan.ts";
import { siteLabel } from "./lookaround-needs-rival-comment.ts";

export const EXEMPT_MARKER = "reads-past-line:";

interface CharClass {
  start: number;
  // Offset of the closing `]`.
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

// Whether a negated class matches `\n`. A lone `\r` never reaches the
// compiler's tokenizer, since `SparkdownDocumentRegistry` turns every line
// break into `\n`, and in a `\r\n` break the `\n` still stops the class;
// many classes in the grammar exclude only `\n` for that reason. A class
// JavaScript cannot compile is left alone.
export function negatedClassMatchesLineBreak(text: string): boolean {
  if (!text.startsWith("[^")) return false;
  for (const flags of ["u", ""]) {
    try {
      return new RegExp(text, flags).test("\n");
    } catch {}
  }
  return false;
}

// Whether a quantifier at `at` lets the atom before it repeat.
function repeats(source: string, at: number): boolean {
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

// The offset just past a quantifier (and its lazy `?`) at `at`, or `at`.
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

const isLookbehind = (g: RegexGroup) =>
  g.kind === "lookbehind" || g.kind === "negative-lookbehind";
const isLookahead = (g: RegexGroup) =>
  g.kind === "lookahead" || g.kind === "negative-lookahead";

// Whether the pattern can read on after the atom that ends at `after`
// (the offset just past it): something other than the end of its
// lookahead or of the whole pattern comes next.
function readsOnAfter(source: string, after: number, groups: RegexGroup[]): boolean {
  let i = skipQuantifier(source, after);
  for (;;) {
    if (i >= source.length) return false;
    const ch = source[i];
    if (ch !== ")" && ch !== "|") return true;
    // The innermost group still open at `i`.
    const group = groups.filter((g) => g.start < i && g.end >= i).sort((a, b) => b.start - a.start)[0];
    if (!group) {
      // A top-level `|` ends this branch: nothing more is read after it.
      return false;
    }
    if (isLookahead(group)) return false;
    i = skipQuantifier(source, group.end + 1);
  }
}

// Whether a class at `cls` lets the pattern `source` read past the line.
function crossesLine(source: string, cls: CharClass, groups: RegexGroup[]): boolean {
  if (!negatedClassMatchesLineBreak(cls.text)) return false;
  const enclosing = groups.filter((g) => g.start < cls.start && g.end > cls.end);
  if (enclosing.some(isLookbehind)) return false;
  // Only the groups inside the innermost lookahead repeat what the
  // lookahead reads.
  const lookahead = enclosing.filter(isLookahead).sort((a, b) => b.start - a.start)[0];
  const repeatable = enclosing.filter((g) => !lookahead || g.start > lookahead.start);
  return (
    repeats(source, cls.end + 1) ||
    repeatable.some((g) => repeats(source, g.end + 1)) ||
    readsOnAfter(source, cls.end + 1, groups)
  );
}

// A pattern with its variable references expanded. For each character of
// `text`, `rawOffset` is its offset in the written pattern (or -1 when a
// variable brought it in) and `variables` the references it came through,
// outermost first.
interface Expanded {
  text: string;
  rawOffset: number[];
  variables: string[][];
}

const REFERENCE = /\{\{([A-Za-z0-9_]+)\}\}/g;

// A variable's value as the build substitutes it: a sequence becomes
// `\b(?:a|b)\b`.
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

function expand(source: string, index: GrammarIndex): Expanded {
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
        // An undefined name or a cycle stays a literal token, as the build
        // reports it.
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
      crosses: `{{site}}: \`{{cls}}\`{{from}} matches a line break and the pattern reads on past it, into the next line, which VS Code and the editor never show it and an incremental reparse does not redo. Add \`\\r\\n\` to the class, or give a variable that reads past the line on purpose a \`# ${EXEMPT_MARKER}\` comment saying why. See GRAMMAR.md §11.5.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const exempt = (name: string) => {
      const pair = index.variables.get(name);
      return pair !== undefined && markedComment(index, [pair.loc.start.line], EXEMPT_MARKER) !== null;
    };
    const findings: Finding[] = [];
    for (const site of index.patternSites) {
      // A variable is checked where a rule uses it, with the pattern around it.
      if (site.owner.kind === "variable") continue;
      const expanded = expand(site.source, index);
      const groups = regexGroups(expanded.text);
      for (const cls of charClasses(expanded.text)) {
        const chain = expanded.variables[cls.start]!;
        if (chain.some(exempt)) continue;
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
