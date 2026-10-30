import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex, markedComment } from "../utils/grammar-index.ts";
import { REFERENCED_FROM } from "./no-unreferenced-rule.ts";

const { rule, find } = defineBaselinedRule(
  {
    type: "suggestion",
    docs: {
      description:
        "Disallow variables that no `{{NAME}}` reference expands.",
    },
    messages: {
      unused: `Variable \`{{name}}\` is never expanded by a \`{{{{name}}}}\` reference. Remove it, or, if TypeScript reads it from \`GRAMMAR_DEFINITION.variables\`, say where with a \`# referenced-from:\` comment above it. See GRAMMAR.md §7.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    if (!index.root) return [];
    const used = new Set<string>();
    for (const site of index.patternSites) {
      for (const match of site.source.matchAll(/\{\{(\w+)\}\}/g)) {
        if (site.owner.kind === "variable" && site.owner.name === match[1]) continue;
        used.add(match[1]!);
      }
    }
    const findings: Finding[] = [];
    for (const [name, pair] of index.variables) {
      if (used.has(name)) continue;
      if (markedComment(index, [pair.loc.start.line], REFERENCED_FROM)) continue;
      findings.push({
        owner: `variables.${name}`,
        loc: pair.key?.loc ?? pair.loc,
        messageId: "unused",
        data: { name },
      });
    }
    return findings;
  },
);

export { find };
export default rule;
