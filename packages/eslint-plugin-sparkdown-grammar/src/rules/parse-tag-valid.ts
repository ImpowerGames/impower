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
import { readTagExpression } from "../../../textmate-grammar-tree/src/grammar/utils/readTagExpression.ts";
import { readTagModifier } from "../../../textmate-grammar-tree/src/grammar/utils/readTagModifier.ts";
import { splitTag } from "../../../textmate-grammar-tree/src/grammar/utils/splitTag.ts";

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
        "`tag` value {{value}} does not match the parseTag syntax `(modifier?) expression`. See GRAMMAR.md §8.",
      invalidExpression:
        "`tag` value {{value}} is invalid: {{reason}}. See GRAMMAR.md §8.",
      invalidModifier: "{{reason}}. See GRAMMAR.md §8.",
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

        const split = splitTag(value);
        if (!split) {
          context.report({
            loc: scalar.loc,
            messageId: "malformed",
            data: { value: JSON.stringify(value) },
          });
          return;
        }
        const tagExpression = split.expression;
        if (!tagExpression) {
          context.report({
            loc: scalar.loc,
            messageId: "malformed",
            data: { value: JSON.stringify(value) },
          });
          return;
        }
        try {
          readTagModifier(split.modifier ?? "", value);
        } catch (error) {
          context.report({
            loc: scalar.loc,
            messageId: "invalidModifier",
            data: { reason: (error as Error).message },
          });
          return;
        }
        try {
          readTagExpression(tagExpression, lezerTags, value);
        } catch (error) {
          context.report({
            loc: scalar.loc,
            messageId: "invalidExpression",
            data: { value: JSON.stringify(value), reason: (error as Error).message },
          });
        }
      },
    };
  },
};

export default rule;
