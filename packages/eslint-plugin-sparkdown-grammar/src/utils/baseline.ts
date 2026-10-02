// Baseline support for rules whose findings already exist in the grammar.
//
// A baselined rule takes one option, `{ baseline: { [owner]: count } }`,
// where an owner is a repository rule (`repository.Name`), a variable
// (`variables.NAME`) or the top-level `patterns` list (see
// grammar-index.ts). The rule reports nothing for an owner whose findings
// number no more than its baseline count, and reports every finding of an
// owner that has more, since it cannot tell which one is new. A count that
// falls is not reported; `baseline-cli.ts --check` lists those, and
// `--write` rewrites the file. The recommended configuration passes each
// rule its section of `baseline.json`; overriding a rule with an empty
// baseline lists every existing finding.
//
// Counting per owner rather than per line keeps the baseline stable while
// other changes move or edit the grammar around a finding.

import type { AST as ESTreeAST, Rule } from "eslint";

export interface Finding {
  owner: string;
  loc: ESTreeAST.SourceLocation;
  messageId: string;
  data?: Record<string, string>;
}

export interface BaselinedRule {
  rule: Rule.RuleModule;
  // The rule's findings before the baseline is applied (used by the
  // baseline CLI and by tests).
  find(context: Rule.RuleContext): Finding[];
}

export const BASELINE_SCHEMA = [
  {
    type: "object",
    properties: {
      baseline: {
        type: "object",
        additionalProperties: { type: "integer", minimum: 1 },
      },
    },
    additionalProperties: false,
  },
];

// Every message of a baselined rule ends with this placeholder.
export const BASELINE_NOTE = "{{baselineNote}}";

export function defineBaselinedRule(
  meta: Rule.RuleMetaData,
  find: (context: Rule.RuleContext) => Finding[],
): BaselinedRule {
  const rule: Rule.RuleModule = {
    meta: { ...meta, schema: BASELINE_SCHEMA },
    create(context) {
      return {
        "Program:exit"() {
          const options = context.options[0] as
            | { baseline?: Record<string, number> }
            | undefined;
          const baseline = options?.baseline ?? {};
          const byOwner = new Map<string, Finding[]>();
          for (const finding of find(context)) {
            const list = byOwner.get(finding.owner) ?? [];
            list.push(finding);
            byOwner.set(finding.owner, list);
          }
          for (const [owner, findings] of byOwner) {
            const allowed = baseline[owner] ?? 0;
            if (findings.length <= allowed) continue;
            const baselineNote =
              allowed === 0
                ? ""
                : ` (${findings.length} findings in \`${owner}\`; the baseline allows ${allowed})`;
            for (const finding of findings) {
              context.report({
                loc: finding.loc,
                messageId: finding.messageId,
                data: { ...finding.data, baselineNote },
              });
            }
          }
        },
      };
    },
  };
  return { rule, find };
}
