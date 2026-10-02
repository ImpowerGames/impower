// Rule: a `Scoped` rule (one with `begin:` and `end:`) commits once its
// `begin:` matches, so its `end:` must also close at a line end or at the
// next beat. Otherwise a forgotten closer lets the rule run on to the end
// of the document (GRAMMAR.md §3.1, §18). So the `end:` pattern, with its
// variables substituted, must be able to match with no closer present: at
// the end of a line, at the start of the next beat (`{{BEAT}}`), or at the
// start of the next unindented line (§11.1's indentation-block end
// `(?=^(?!$|//|\1{{WS}}))`).
//
// The check resolves the variables (`{{BEAT}}` to its real definition),
// splits the pattern into its alternatives (unwrapping a group that holds
// the whole of one), and runs each alternative on its own as a sticky
// regex at probe positions. An alternative is a bail-out when:
//
// - it matches at a line boundary (a line end as `\n`, `\r\n`, `\r` or the
//   end of the input, or the start of an unindented line) whatever text
//   surrounds it: every filler in FILLERS must pass, so a closer class such
//   as `[^\w\s]` that happens to match one filler is not a bail-out; or
// - it matches at the start of a `scene` / `branch` line but not at the
//   same text in the middle of a line, so the match depends on the beat's
//   line start rather than on a closer that spells the keyword.
//
// Testing alternatives one at a time keeps an impossible BEAT branch,
// `(?={{BEAT}})(?!{{BEAT}})`, from borrowing a match from an unrelated
// closer such as `|(scene)`. A back-reference stands for a `begin:`
// capture this check cannot see, so it is replaced by a sentinel no probe
// holds: `(\1)` needs its delimiter, while `(?!\1{{WS}})` still holds
// where the line does not repeat it. A pattern that does not compile as a
// JavaScript regex falls back to a textual check: a `$` or `{{BEAT}}`
// outside a character class and outside a negative lookaround, or a `^`
// followed by a negative lookahead, counts.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { findPair, isScalar, isSequence } from "../utils/yaml-ast.ts";
import { getGrammarIndex, type GrammarIndex } from "../utils/grammar-index.ts";
import {
  regexGroups,
  scanRegex,
  splitTopLevelAlternation,
} from "../utils/regex-scan.ts";

const TOKEN = /\{\{([A-Za-z0-9_]+)\}\}/g;

const BACKREFERENCE_SENTINEL = "(?:▓)";

// Line text around a probed boundary: a word character, a digit and a
// symbol no closer in the grammar uses.
const FILLERS = ["a", "7", "░"];

// Line boundaries, as text built from a filler and the probed offset: the
// end of a line in each newline form, the end of the input, and the start
// of an unindented line.
const LINE_PROBES: ((f: string) => [text: string, at: number])[] = [
  (f) => [`${f}${f}\n${f}`, 2],
  (f) => [`${f}${f}\r\n${f}`, 2],
  (f) => [`${f}${f}\r${f}`, 2],
  (f) => [`${f}${f}`, 2],
  (f) => [`${f}\n${f}`, 2],
  (f) => [`${f}\r\n${f}`, 3],
];

// The start of a beat line, and the same text in the middle of a line.
const BEAT_PROBES: [beat: string, control: string][] = [
  ["░\nscene ░\n", "░░scene ░\n"],
  ["░\nbranch ░\n", "░░branch ░\n"],
];

// The alternatives of a regex source, splitting through any group that
// spans a whole alternative.
function alternativesOf(source: string): string[] {
  const out: string[] = [];
  for (const { text } of splitTopLevelAlternation(source)) {
    const whole = regexGroups(text).find(
      (g) =>
        g.start === 0 &&
        g.end === text.length - 1 &&
        (g.kind === "non-capturing" || g.kind === "capture"),
    );
    if (whole && splitTopLevelAlternation(whole.body).length > 1) {
      out.push(...alternativesOf(whole.body));
    } else {
      out.push(text);
    }
  }
  return out;
}

function isBailOutAlternative(regex: RegExp): boolean {
  const matchesAt = (text: string, at: number): boolean => {
    regex.lastIndex = at;
    return regex.test(text);
  };
  return (
    LINE_PROBES.some((probe) =>
      FILLERS.every((filler) => matchesAt(...probe(filler))),
    ) ||
    BEAT_PROBES.some(
      ([beat, control]) => matchesAt(beat, 2) && !matchesAt(control, 2),
    )
  );
}

// Substitutes variables (all of them, or all but `BEAT`, which then stays
// as a literal token). Undefined names and cycles stay as tokens.
function resolveVariables(
  index: GrammarIndex,
  source: string,
  keepBeat: boolean,
  seen: Set<string> = new Set(),
): string {
  return source.replace(TOKEN, (whole, name: string) => {
    if ((keepBeat && name === "BEAT") || seen.has(name)) return whole;
    const value = index.variables.get(name)?.value ?? null;
    let raw: string | null = null;
    if (isScalar(value) && typeof value.value === "string") raw = value.value;
    else if (isSequence(value)) {
      raw = `\\b(?:${value.entries
        .map((e) => (isScalar(e) && e.value !== null ? String(e.value) : ""))
        .join("|")})\\b`;
    }
    if (raw === null) return whole;
    return resolveVariables(index, raw, keepBeat, new Set([...seen, name]));
  });
}

export function hasBailOut(index: GrammarIndex, end: string): boolean {
  const source = resolveVariables(index, end, false)
    // Walk escapes pairwise so an escaped backslash before a digit is
    // left alone.
    .replace(/\\(?:[1-9]|k<[^>]*>|[^])/g, (escape) =>
      /^\\(?:[1-9]|k<)/.test(escape) ? BACKREFERENCE_SENTINEL : escape,
    );
  let alternatives: RegExp[];
  try {
    alternatives = alternativesOf(source).map((alt) => new RegExp(alt, "muy"));
  } catch {
    return hasTextualBailOut(index, end);
  }
  return alternatives.some(isBailOutAlternative);
}

// Whether the offset sits outside every negative lookaround of `source`.
function positiveAt(source: string): (at: number) => boolean {
  const negated = regexGroups(source).filter(
    (g) => g.kind === "negative-lookahead" || g.kind === "negative-lookbehind",
  );
  return (at) => !negated.some((g) => g.start < at && at < g.end);
}

// Whether `source` (variables resolved except `BEAT`) names `{{BEAT}}`
// outside a character class and every negative lookaround.
function namesPositiveBeat(source: string): boolean {
  const positive = positiveAt(source);
  for (const tok of scanRegex(source)) {
    if (tok.inCharClass) continue;
    if (tok.text === "{" && source.startsWith("{{BEAT}}", tok.index) && positive(tok.index)) {
      return true;
    }
  }
  return false;
}

function hasTextualBailOut(index: GrammarIndex, end: string): boolean {
  const resolved = resolveVariables(index, end, true);
  if (namesPositiveBeat(resolved)) return true;
  // A boundary inside a negative lookaround asserts its absence, as in
  // `(?!$)`, so it is no bail-out.
  const positive = positiveAt(resolved);
  for (const tok of scanRegex(resolved)) {
    if (tok.inCharClass) continue;
    if (tok.text === "$" && positive(tok.index)) return true;
    // §11.1's indentation block, `(?=^(?!$|//|\1{{WS}}))`, closes at the
    // start of every line but the ones it excludes, which bounds it as a
    // line end would.
    if (tok.text === "^" && resolved.startsWith("(?!", tok.index + 1) && positive(tok.index)) {
      return true;
    }
  }
  return false;
}

const { rule, find } = defineBaselinedRule(
  {
    type: "problem",
    docs: {
      description:
        "Require a `{{BEAT}}` or `$` bail-out in every `begin`/`end` rule's `end:` pattern.",
    },
    messages: {
      noBailOut: `\`end:\` of {{name}} matches only after its closer, with no \`{{BEAT}}\` or line-end alternative, so a missing closer lets the rule run on to the end of the document. Add \`(?={{BEAT}})|\` or a \`$\` alternative. See GRAMMAR.md §3.1, §18.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const findings: Finding[] = [];
    for (const { owner, mapping } of index.ruleMappings) {
      const begin = findPair(mapping, "begin");
      const end = findPair(mapping, "end");
      if (!begin || !end) continue;
      if (!isScalar(end.value) || typeof end.value.value !== "string") continue;
      if (hasBailOut(index, end.value.value)) continue;
      const inline = owner.pair?.value !== mapping;
      findings.push({
        owner: owner.id,
        loc: end.value.loc,
        messageId: "noBailOut",
        data: { name: `${owner.name}${inline ? " (inline rule)" : ""}` },
      });
    }
    return findings;
  },
);

export { find };
export default rule;
