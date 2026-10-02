// Rule: `tag` and `name` appear together on grammar rules, both ways. Per
// GRAMMAR.md §8, the two attributes target different renderers
// (Lezer/CodeMirror vs VS Code's TextMate engine) and one can't be
// inferred from the other: a rule with only one of them highlights in one
// editor and not the other.
//
// A `name:` without a `tag:` is baselined per owner (see
// utils/baseline.ts) for the region rules that predate this check.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { findPair } from "../utils/yaml-ast.ts";
import { getGrammarIndex } from "../utils/grammar-index.ts";

const { rule, find } = defineBaselinedRule(
  {
    type: "problem",
    docs: {
      description:
        "Require `tag` and `name` to appear together on grammar rules.",
    },
    messages: {
      missingName: `Rule has \`tag\` but no \`name\`. VS Code highlighting needs the TextMate scope name too. See GRAMMAR.md §8.${BASELINE_NOTE}`,
      missingTag: `Rule has \`name\` but no \`tag\`. CodeMirror highlighting needs the Lezer tag too. See GRAMMAR.md §8.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const findings: Finding[] = [];
    for (const { owner, mapping } of getGrammarIndex(context).ruleMappings) {
      const tagPair = findPair(mapping, "tag");
      const namePair = findPair(mapping, "name");
      if (tagPair && !namePair) {
        findings.push({ owner: owner.id, loc: tagPair.loc, messageId: "missingName" });
      } else if (namePair && !tagPair) {
        findings.push({ owner: owner.id, loc: namePair.loc, messageId: "missingTag" });
      }
    }
    return findings;
  },
);

export { find };
export default rule;
