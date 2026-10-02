// Rule: a `Scoped` rule (one with `begin:` and `end:`) commits once its
// `begin:` matches, so its `end:` must also close at a line end or at the
// next beat. Otherwise a forgotten closer lets the rule run on to the end
// of the document (GRAMMAR.md §3.1, §18). The `end:` pattern must contain
// `{{BEAT}}` or a `$` anchor, written directly or through the variables
// it references.
//
// A `$` or `{{BEAT}}` counts unless it sits in a character class or in a
// negative lookaround (`(?!$)` asserts that the line goes on). So does a
// line start followed by a negative lookahead, §11.1's indentation-block
// end `(?=^(?!$|//|\1{{WS}}))`, which closes at the first line that does
// not continue the block. The check
// is otherwise textual: a `$` behind some other requirement still counts,
// so the rule misses some ends that cannot close at a line end rather than
// flag ones that can.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { findPair, isScalar, isSequence } from "../utils/yaml-ast.ts";
import { getGrammarIndex, type GrammarIndex } from "../utils/grammar-index.ts";
import { regexGroups, scanRegex } from "../utils/regex-scan.ts";

const TOKEN = /\{\{([A-Za-z0-9_]+)\}\}/g;

// Substitutes every variable except `BEAT`, which stays as a literal token
// for the check. Undefined names and cycles stay as tokens.
function resolveExceptBeat(
  index: GrammarIndex,
  source: string,
  seen: Set<string> = new Set(),
): string {
  return source.replace(TOKEN, (whole, name: string) => {
    if (name === "BEAT" || seen.has(name)) return whole;
    const value = index.variables.get(name)?.value ?? null;
    let raw: string | null = null;
    if (isScalar(value) && typeof value.value === "string") raw = value.value;
    else if (isSequence(value)) {
      raw = `\\b(?:${value.entries
        .map((e) => (isScalar(e) && e.value !== null ? String(e.value) : ""))
        .join("|")})\\b`;
    }
    if (raw === null) return whole;
    return resolveExceptBeat(index, raw, new Set([...seen, name]));
  });
}

export function hasBailOut(index: GrammarIndex, end: string): boolean {
  const resolved = resolveExceptBeat(index, end);
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
      noBailOut: `\`end:\` of {{name}} has neither \`{{BEAT}}\` nor \`$\`, so a missing closer lets the rule run on past the line, to the end of the document. Add \`(?={{BEAT}})|\` or a line-end alternative. See GRAMMAR.md §3.1, §18.${BASELINE_NOTE}`,
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
