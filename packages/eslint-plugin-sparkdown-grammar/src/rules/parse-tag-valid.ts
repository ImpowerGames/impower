// Rule: a `tag:` value must parse with the parseTag mini-syntax AND
// every name referenced (base tag + wrapper functions) must exist in
// `@lezer/highlight`'s `tags` namespace. Mirrors the runtime
// `parseTag()` in `packages/codemirror-vscode-language/src/utils/parseTag.ts`
// so authors get fast feedback instead of a cryptic CodeMirror highlight-
// builder failure at boot time.

import type { Rule } from "eslint";
import { tags as lezerTags } from "@lezer/highlight";
import {
  findPair,
  isMapping,
  isRuleMapping,
  isScalar,
  type YAMLMapping,
  type YAMLScalar,
} from "../utils/yaml-ast.ts";

const PARSE_TAG_REGEX = /^(?:\((\S*?)\))?(?:\s+|^)(\S+)$/;

function validateTagExpression(expr: string): string | null {
  const parts = expr.split("(");
  const baseRaw = parts.pop();
  if (!baseRaw) return "tag expression is empty";
  const base = baseRaw.replace(/\)+$/, "");
  const funcs = parts;
  if (!(base in lezerTags)) {
    return `unknown base tag "${base}" — must be a name exported by @lezer/highlight's \`tags\``;
  }
  for (const func of funcs) {
    if (!(func in lezerTags)) {
      return `unknown tag function "${func}" — must be a name exported by @lezer/highlight's \`tags\``;
    }
  }
  return null;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `tag` values to parse via parseTag and reference valid Lezer tag names.",
    },
    schema: [],
    messages: {
      malformed:
        "`tag` value {{value}} does not match the parseTag syntax `(modifier?) expression`. See GRAMMAR.md §7.",
      invalidExpression:
        "`tag` value {{value}} is invalid: {{reason}}. See GRAMMAR.md §7.",
    },
  },
  create(context) {
    return {
      YAMLMapping(node: unknown) {
        const mapping = node as YAMLMapping;
        if (!isMapping(mapping) || !isRuleMapping(mapping)) return;
        const tagPair = findPair(mapping, "tag");
        if (!tagPair || !isScalar(tagPair.value)) return;
        const scalar = tagPair.value as YAMLScalar;
        if (typeof scalar.value !== "string") return;
        const value = scalar.value;

        const match = PARSE_TAG_REGEX.exec(value);
        if (!match) {
          context.report({
            loc: scalar.loc,
            messageId: "malformed",
            data: { value: JSON.stringify(value) },
          });
          return;
        }
        const [, , tagExpression] = match;
        if (!tagExpression) {
          context.report({
            loc: scalar.loc,
            messageId: "malformed",
            data: { value: JSON.stringify(value) },
          });
          return;
        }
        const reason = validateTagExpression(tagExpression);
        if (reason) {
          context.report({
            loc: scalar.loc,
            messageId: "invalidExpression",
            data: { value: JSON.stringify(value), reason },
          });
        }
      },
    };
  },
};

export default rule;
