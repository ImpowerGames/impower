// Rule: every variable must be expanded somewhere (GRAMMAR.md §7). A
// variable no `{{NAME}}` reference uses is dead text in the `variables:`
// block. A variable that TypeScript reads directly from
// `GRAMMAR_DEFINITION.variables` is exempt when the comment block directly
// above its key carries `# referenced-from: <file>`.
//
// Only references the build expands count: those in a rule's `match`,
// `begin` or `end` (definitions/src/language.ts substitutes no other key)
// and those in another variable's value or array entries. A `{{NAME}}`
// mentioned in a `comment:` or other metadata, or in the variable's own
// value, is not a use. The findings agree with the known-unused list of
// the `grammarReachability` test in packages/sparkdown/src/tests/compiler/
// (see no-unreferenced-rule.test.ts).

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
