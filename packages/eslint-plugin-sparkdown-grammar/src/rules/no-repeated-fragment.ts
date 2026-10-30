import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import { getGrammarIndex, type PatternSite } from "../utils/grammar-index.ts";
import { regexGroups, type RegexGroup } from "../utils/regex-scan.ts";
import { rangeInScalar } from "../utils/yaml-ast.ts";
import { siteLabel } from "./lookaround-needs-rival-comment.ts";

export const MIN_LENGTH = 13;

interface Occurrence {
  site: PatternSite;
  group: RegexGroup;
}

const { rule, find } = defineBaselinedRule(
  {
    type: "suggestion",
    docs: {
      description:
        "Flag `(?:…)` groups repeated verbatim across patterns that should be a variable.",
    },
    messages: {
      repeated: `\`{{fragment}}\` is written verbatim {{count}} times ({{where}}). {{advice}} See GRAMMAR.md §7.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const bySite = new Map<PatternSite, RegexGroup[]>();
    const byText = new Map<string, Occurrence[]>();
    for (const site of index.patternSites) {
      const groups = regexGroups(site.source).filter(
        (g) => g.kind === "non-capturing" && g.text.length >= MIN_LENGTH,
      );
      bySite.set(site, groups);
      for (const group of groups) {
        const list = byText.get(group.text) ?? [];
        list.push({ site, group });
        byText.set(group.text, list);
      }
    }
    const isRepeated = (text: string): boolean =>
      (byText.get(text) ?? []).length >= 2;
    const isWholeVariable = ({ site, group }: Occurrence): boolean =>
      site.key === "value" && group.text === site.source;

    const findings: Finding[] = [];
    for (const [site, groups] of bySite) {
      for (const group of groups) {
        if (!isRepeated(group.text)) continue;
        if (isWholeVariable({ site, group })) continue;
        let outer = group.parent;
        let nestedInRepeated = false;
        while (outer) {
          if (outer.kind === "non-capturing" && isRepeated(outer.text)) {
            nestedInRepeated = true;
            break;
          }
          outer = outer.parent;
        }
        if (nestedInRepeated) continue;
        const occurrences = byText.get(group.text)!;
        const sites = [...new Set(occurrences.map((o) => o.site))];
        const others = sites.filter((s) => s !== site).map(siteLabel);
        const named = occurrences.find(isWholeVariable);
        findings.push({
          owner: site.owner.id,
          loc: rangeInScalar(context, site.scalar, group.start, group.text.length),
          messageId: "repeated",
          data: {
            fragment:
              group.text.length > 60 ? `${group.text.slice(0, 57)}...` : group.text,
            count: String(occurrences.length),
            where:
              others.length === 0
                ? "all in this pattern"
                : "also in " +
                  others.slice(0, 3).join(", ") +
                  (others.length > 3 ? `, and ${others.length - 3} more` : ""),
            advice: named
              ? `Use \`{{${named.site.owner.name}}}\` instead.`
              : "Name it as a variable and reference that.",
          },
        });
      }
    }
    return findings;
  },
);

export { find };
export default rule;
