// Rule: GRAMMAR.md §11.5, "no single `begin:`, `end:`, or `match:`
// pattern can extend past that `\n` into the next line's content". A
// negated character class such as `[^()]` also matches a line break, so
// a pattern that repeats it, or reads on after it, can read the lines
// below its own: VS Code and the web editor, which hand the tokenizer
// one line at a time, never see them, and an incremental reparse keeps
// the token although an edit on a later line changes what the pattern
// read (#1583). Adding `\r\n` to the class keeps it on its line.
//
// A class that matches a line break is reported when it is repeated
// (`*`, `+`, `{n,}`), sits in a repeated group, or has more pattern after
// it before its lookaround or the whole pattern ends. A class whose
// match can only be the line's own break (`(?=[^{])`) passes, and so does
// a class inside a lookbehind, which reads backwards. A pattern that
// deliberately skips blank and comment lines to the next token is
// baselined: the incremental parse restarts at the last code line above
// an edit, so those lookaheads see their edits.
//
// One finding per class. Existing findings are baselined per owner.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex } from "../utils/grammar-index.ts";
import { rangeInScalar } from "../utils/yaml-ast.ts";
import { type RegexGroup, regexGroups, scanRegex } from "../utils/regex-scan.ts";
import { siteLabel } from "./lookaround-needs-rival-comment.ts";

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

// Whether a negated class matches a line break. A class JavaScript
// cannot compile (a `{{VAR}}` inside it) is left alone.
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
function readsOnAfter(source: string, after: number, enclosing: RegexGroup[]): boolean {
  let i = skipQuantifier(source, after);
  for (;;) {
    if (i >= source.length) return false;
    const ch = source[i];
    if (ch !== ")" && ch !== "|") return true;
    // The innermost group still open at `i`.
    const group = enclosing.filter((g) => g.start < i && g.end >= i).sort((a, b) => b.start - a.start)[0];
    if (!group) {
      // A top-level `|` ends this branch: nothing more is read after it.
      return false;
    }
    if (isLookahead(group)) return false;
    i = skipQuantifier(source, group.end + 1);
  }
}

const { rule, find } = defineBaselinedRule(
  {
    type: "problem",
    docs: {
      description:
        "Disallow a negated character class that lets a pattern read past its line's break; add `\\r\\n` to the class.",
    },
    messages: {
      crosses: `{{site}}: \`{{cls}}\` matches a line break and the pattern reads on past it, into the next line, which VS Code and the editor never show it and an incremental reparse does not redo. Add \`\\r\\n\` to the class. See GRAMMAR.md §11.5.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const findings: Finding[] = [];
    for (const site of index.patternSites) {
      const groups = regexGroups(site.source);
      for (const cls of charClasses(site.source)) {
        if (!negatedClassMatchesLineBreak(cls.text)) continue;
        const enclosing = groups.filter((g) => g.start < cls.start && g.end > cls.end);
        if (enclosing.some(isLookbehind)) continue;
        // Only the groups inside the innermost lookahead repeat what the
        // lookahead reads.
        const lookahead = enclosing.filter(isLookahead).sort((a, b) => b.start - a.start)[0];
        const repeatable = enclosing.filter((g) => !lookahead || g.start > lookahead.start);
        const crosses =
          repeats(site.source, cls.end + 1) ||
          repeatable.some((g) => repeats(site.source, g.end + 1)) ||
          readsOnAfter(site.source, cls.end + 1, groups);
        if (!crosses) continue;
        findings.push({
          owner: site.owner.id,
          loc: rangeInScalar(context, site.scalar, cls.start, cls.text.length),
          messageId: "crosses",
          data: { site: siteLabel(site), cls: cls.text },
        });
      }
    }
    return findings;
  },
);

export { find };
export default rule;
