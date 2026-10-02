// Rule: a `Scoped` rule (one with `begin:` and `end:`) commits once its
// `begin:` matches, so its `end:` must also close at a line end or at the
// next beat. Otherwise a forgotten closer lets the rule run on to the end
// of the document (GRAMMAR.md §3.1, §18). So the `end:` pattern, with its
// variables substituted, must be able to match with no closer present: at
// the end of a line, at the start of the next beat (`{{BEAT}}`), or at the
// start of the next unindented line (§11.1's indentation-block end
// `(?=^(?!$|//|\1{{WS}}))`).
//
// The check runs the resolved pattern against probe lines, so `[)]$`
// (which needs the closer before the line end) and `(?!$)[)]` fail it
// while `$|([)])` passes. Back-references, which refer to `begin:`
// captures, are replaced by empty groups for the probe. A pattern that
// does not compile as a JavaScript regex falls back to a textual check: a
// `$` or `{{BEAT}}` outside a character class and outside a negative
// lookaround, or a `^` followed by a negative lookahead, counts.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { findPair, isScalar, isSequence } from "../utils/yaml-ast.ts";
import { getGrammarIndex, type GrammarIndex } from "../utils/grammar-index.ts";
import { regexGroups, scanRegex } from "../utils/regex-scan.ts";

const TOKEN = /\{\{([A-Za-z0-9_]+)\}\}/g;

// Places where an end with a bail-out matches without any closer: the end
// of a line, the start of an unindented line, and the start of a beat
// line. Line text is a character no closer uses. A beat probe counts only
// when the same pattern fails on its control line, a longer word that is
// no beat keyword, so an end that matches the keyword's first letters is
// not taken for a beat bail-out.
const LINE_PROBES: [text: string, at: number][] = [
  ["░░\n░░", 2],
  ["░░", 2],
  ["░░\n░░", 3],
];
const BEAT_PROBES: [beat: string, control: string][] = [
  ["░\nscene ░\n", "░\nscenery ░\n"],
  ["░\nbranch ░\n", "░\nbranching ░\n"],
];

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
  let probe: RegExp | null = null;
  try {
    const source = resolveVariables(index, end, false).replace(/\\[1-9]/g, "(?:)");
    probe = new RegExp(source, "muy");
  } catch {
    probe = null;
  }
  if (probe) {
    const matchesAt = (text: string, at: number): boolean => {
      probe!.lastIndex = at;
      return probe!.test(text);
    };
    return (
      LINE_PROBES.some(([text, at]) => matchesAt(text, at)) ||
      BEAT_PROBES.some(
        ([beat, control]) => matchesAt(beat, 2) && !matchesAt(control, 2),
      )
    );
  }
  return hasTextualBailOut(index, end);
}

function hasTextualBailOut(index: GrammarIndex, end: string): boolean {
  const resolved = resolveVariables(index, end, true);
  // A boundary inside a negative lookaround asserts its absence, as in
  // `(?!$)`, so it is no bail-out.
  const negated = regexGroups(resolved).filter(
    (g) => g.kind === "negative-lookahead" || g.kind === "negative-lookbehind",
  );
  const positive = (at: number) =>
    !negated.some((g) => g.start < at && at < g.end);
  for (const tok of scanRegex(resolved)) {
    if (tok.inCharClass) continue;
    if (tok.text === "$" && positive(tok.index)) return true;
    // §11.1's indentation block, `(?=^(?!$|//|\1{{WS}}))`, closes at the
    // start of every line but the ones it excludes, which bounds it as a
    // line end would.
    if (tok.text === "^" && resolved.startsWith("(?!", tok.index + 1) && positive(tok.index)) {
      return true;
    }
    if (tok.text === "{" && resolved.startsWith("{{BEAT}}", tok.index) && positive(tok.index)) {
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
