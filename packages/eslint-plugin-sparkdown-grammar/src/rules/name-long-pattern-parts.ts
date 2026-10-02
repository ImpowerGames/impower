// Rule: GRAMMAR.md §7.2, "if the regex has more than two `(?:...)`
// groups or any nested lookahead, name something". A pattern (a rule's
// `match`/`begin`/`end` or a string variable's value, as written) with
// more than two non-capturing groups, or with a lookaround nested inside
// another lookaround, should give its parts names as variables, even
// names used only once.
//
// One finding per pattern. Existing findings are baselined per owner.

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex } from "../utils/grammar-index.ts";
import { isLookaround, regexGroups } from "../utils/regex-scan.ts";
import { siteLabel } from "./lookaround-needs-rival-comment.ts";

export const MAX_GROUPS = 2;

const { rule, find } = defineBaselinedRule(
  {
    type: "suggestion",
    docs: {
      description:
        "Require long patterns (more than two `(?:…)` groups, or nested lookarounds) to name their parts as variables.",
    },
    messages: {
      long: `{{site}} {{reason}}. Give its parts names as variables, even ones used once. See GRAMMAR.md §7.2.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const findings: Finding[] = [];
    for (const site of index.patternSites) {
      const groups = regexGroups(site.source);
      const nonCapturing = groups.filter((g) => g.kind === "non-capturing").length;
      const nested = groups.filter(
        (g) => isLookaround(g.kind) && g.lookaroundDepth > 0,
      ).length;
      if (nonCapturing <= MAX_GROUPS && nested === 0) continue;
      const reasons: string[] = [];
      if (nonCapturing > MAX_GROUPS) {
        reasons.push(`has ${nonCapturing} \`(?:…)\` groups`);
      }
      if (nested > 0) {
        reasons.push(
          `nests ${nested} lookaround${nested === 1 ? "" : "s"} inside another lookaround`,
        );
      }
      findings.push({
        owner: site.owner.id,
        loc: site.scalar.loc,
        messageId: "long",
        data: { site: siteLabel(site), reason: reasons.join(" and ") },
      });
    }
    return findings;
  },
);

export { find };
export default rule;
