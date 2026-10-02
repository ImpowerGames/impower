// Rule: a lookaround is the last resort (GRAMMAR.md §10). Every
// negative lookahead `(?!…)`, every lookbehind `(?<=…)` / `(?<!…)`, and
// every positive lookahead `(?=…)` that is not a line-end or `{{BEAT}}`
// bail-out must be justified by a `# lookaround:` comment in the comment
// block directly above its rule or variable (or above the inline rule or
// pattern key that holds it). The comment names the rival rule the
// lookaround steps aside for and says why §10.1's structural fixes
// (reorder, split a Switch, let the parent's `end:` carry it, tighten a
// variable) do not work. The rule checks that the comment exists and
// names at least one existing rule or variable other than its own
// owner; whether the reason holds is the reviewer's call (§10.2).
//
// Positive lookaheads in an `end:` pattern are exempt: stopping before
// a terminator that belongs to the parent is what §10.1 ("let an `end:`
// pattern carry the load") and §11.3 recommend. A negative lookahead or
// lookbehind there still needs the comment.
//
// Variables are checked too, array entries included: a lookaround moved
// into a variable still steps aside for a rival.
//
// Only real YAML comments count (not `#` text inside a block scalar), and
// the innermost marked block wins: a `# lookaround:` comment above an
// inline rule or pattern key is checked before one above the owner.
//
// Existing findings are baselined per owner (see utils/baseline.ts).

import { BASELINE_NOTE, defineBaselinedRule, type Finding } from "../utils/baseline.ts";
import {
  getGrammarIndex,
  markedComment,
  type GrammarIndex,
  type PatternSite,
} from "../utils/grammar-index.ts";
import { rangeInScalar } from "../utils/yaml-ast.ts";
import {
  regexGroups,
  splitTopLevelAlternation,
  type GroupKind,
} from "../utils/regex-scan.ts";

export const MARKER = "lookaround:";

// One alternative of a bail-out lookahead: an optional run of `{{WS}}`
// and then a line end or the next beat.
const BAIL_OUT_ALTERNATIVE =
  /^(?:\{\{WS\}\}\*)?(?:\$|\{\{BEAT\}\}|\{\{NL\}\}|\{\{EOL\}\}|\\r\\n|\\r|\\n)$/;

export function isBailOut(body: string): boolean {
  return splitTopLevelAlternation(body).every((alt) =>
    BAIL_OUT_ALTERNATIVE.test(alt.text),
  );
}

const KIND_LABEL: Partial<Record<GroupKind, string>> = {
  lookahead: "Lookahead",
  "negative-lookahead": "Negative lookahead",
  lookbehind: "Lookbehind",
  "negative-lookbehind": "Negative lookbehind",
};

// Lookarounds in `site` that need a justification.
export function unjustifiedCandidates(site: PatternSite) {
  return regexGroups(site.source).filter((group) => {
    if (group.kind === "lookahead") {
      return site.key !== "end" && !isBailOut(group.body);
    }
    return KIND_LABEL[group.kind] !== undefined;
  });
}

function namesExisting(
  index: GrammarIndex,
  comment: string[],
  ownerName: string,
): boolean {
  for (const line of comment) {
    for (const word of line.match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? []) {
      if (word === ownerName) continue;
      if (index.rules.has(word) || index.variables.has(word)) return true;
    }
  }
  return false;
}

export function siteLabel(site: PatternSite): string {
  if (site.owner.kind === "variable") {
    const entry = site.key === "entry" ? ` (array entry \`${site.source}\`)` : "";
    return `variable ${site.owner.name}${entry}`;
  }
  const inline = site.mapping && site.owner.pair?.value !== site.mapping;
  return `${site.owner.name}${inline ? " (inline rule)" : ""}.${site.key}`;
}

function shorten(text: string): string {
  return text.length > 60 ? `${text.slice(0, 57)}...` : text;
}

const { rule, find } = defineBaselinedRule(
  {
    type: "suggestion",
    docs: {
      description:
        "Require a `# lookaround:` comment naming the rival rule for each lookaround that is not a line-end or `{{BEAT}}` bail-out.",
    },
    messages: {
      missing: `{{kind}} \`{{text}}\` in {{site}} has no \`# lookaround:\` comment above it naming the rival rule it steps aside for. Reorder, split the Switch, let the parent's \`end:\` carry it, or tighten a variable (§10.1); if none works, name the rival and say why. See GRAMMAR.md §10, §10.2.${BASELINE_NOTE}`,
      noRival: `{{kind}} \`{{text}}\` in {{site}}: the \`# lookaround:\` comment above it names no existing rule or variable. Name the rival rule it steps aside for. See GRAMMAR.md §10.2.${BASELINE_NOTE}`,
    },
  },
  (context) => {
    const index = getGrammarIndex(context);
    const findings: Finding[] = [];
    for (const site of index.patternSites) {
      const candidates = unjustifiedCandidates(site);
      if (candidates.length === 0) continue;
      const comment = markedComment(index, site.anchorLines, MARKER);
      if (comment && namesExisting(index, comment, site.owner.name)) continue;
      for (const group of candidates) {
        findings.push({
          owner: site.owner.id,
          loc: rangeInScalar(context, site.scalar, group.start, group.text.length),
          messageId: comment ? "noRival" : "missing",
          data: {
            kind: KIND_LABEL[group.kind] ?? "Lookaround",
            text: shorten(group.text),
            site: siteLabel(site),
          },
        });
      }
    }
    return findings;
  },
);

export { find };
export default rule;
