// Rule: a `Scoped` rule (one with `begin:` and `end:`) commits once its
// `begin:` matches, so its `end:` must also close at a line end or at the
// next beat. Otherwise a forgotten closer lets the rule run on to the end
// of the document (GRAMMAR.md §3.1, §18). The `end:` pattern must contain
// `{{BEAT}}` or a `$` anchor, written directly or through the variables
// it references.
//
// The check is textual: a `$` anywhere outside a character class counts,
// even one inside a lookaround, so the rule misses some ends that cannot
// actually close at a line end rather than flag ones that can.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { findPair, isScalar, isSequence } from "../utils/yaml-ast.ts";
import { getGrammarIndex, type GrammarIndex } from "../utils/grammar-index.ts";
import { scanRegex } from "../utils/regex-scan.ts";

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
  if (resolved.includes("{{BEAT}}")) return true;
  for (const tok of scanRegex(resolved)) {
    if (tok.text === "$" && !tok.inCharClass) return true;
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
