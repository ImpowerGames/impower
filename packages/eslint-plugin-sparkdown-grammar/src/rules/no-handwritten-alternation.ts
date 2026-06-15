// Rule: flag inline keyword alternations like `(?:show|hide|animate)`
// or `(show|hide|wait)`. They should be extracted to a variable list
// (`IMAGE_CONTROL_KEYWORDS: ["show", "hide", "animate"]`) which the
// build auto-wraps to `\b(?:show|hide|animate)\b` — single source of
// truth, mentioned at every call site, and visible in the
// `variables:` block alongside related lists.
//
// Heuristic: a group whose body is `\w+(\|\w+){2,}` — three or more
// bare-word branches separated by `|`. Three is the threshold; two-
// branch alternations are usually meaningful disjuncts, not lists.

import type { Rule } from "eslint";
import {
  findPair,
  isMapping,
  isRuleMapping,
  isScalar,
  rangeInScalar,
  type YAMLMapping,
  type YAMLScalar,
} from "../utils/yaml-ast.ts";

const ALTERNATION_GROUP = /\((?:\?:)?([a-zA-Z_][\w]*(?:\|[a-zA-Z_][\w]*){2,})\)/g;

const PATTERN_KEYS = ["match", "begin", "end"] as const;

function reportOnScalar(
  context: Rule.RuleContext,
  scalar: YAMLScalar,
  source: string,
): void {
  ALTERNATION_GROUP.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ALTERNATION_GROUP.exec(source)) !== null) {
    const branches = (match[1] ?? "").split("|").length;
    context.report({
      loc: rangeInScalar(context, scalar, match.index, match[0].length),
      messageId: "extractToVariable",
      data: {
        snippet: match[0],
        count: String(branches),
      },
    });
  }
}

const rule: Rule.RuleModule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Flag inline keyword alternations that should live in the `variables:` block.",
    },
    schema: [],
    messages: {
      extractToVariable:
        "Inline alternation `{{snippet}}` ({{count}} keywords). Extract to a `variables:` array (e.g. `MY_KEYWORDS: [\"a\", \"b\", \"c\"]`) so the list has one definition site and is auto-wrapped with `\\b...\\b`.",
    },
  },
  create(context) {
    return {
      YAMLMapping(node: unknown) {
        const mapping = node as YAMLMapping;
        if (!isMapping(mapping) || !isRuleMapping(mapping)) return;
        for (const key of PATTERN_KEYS) {
          const pair = findPair(mapping, key);
          if (
            pair &&
            isScalar(pair.value) &&
            typeof pair.value.value === "string"
          ) {
            reportOnScalar(
              context,
              pair.value as YAMLScalar,
              pair.value.value,
            );
          }
        }
      },
    };
  },
};

export default rule;
