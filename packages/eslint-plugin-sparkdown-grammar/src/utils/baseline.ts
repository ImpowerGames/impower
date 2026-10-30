import type { AST as ESTreeAST, Rule } from "eslint";

export interface Finding {
  owner: string;
  loc: ESTreeAST.SourceLocation;
  messageId: string;
  data?: Record<string, string>;
}

export interface BaselinedRule {
  rule: Rule.RuleModule;
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
