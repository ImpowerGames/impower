// Rule: disallow `\s` outside character classes inside `match`/`begin`/
// `end` patterns and inside `variables:` values. `\s` matches newlines
// too, but TextMate is line-oriented and the grammar's vocabulary of
// "whitespace" classes (`{{WS}}` / `{{NL}}` / etc., see GRAMMAR.md §12)
// distinguishes between horizontal whitespace, line ends, and so on.
// Letting `\s` slip in usually means a regex eats across line
// boundaries that the rule was meant to respect.
//
// `\s` *inside* a character class (e.g. `[^\s,]`) is left alone — it's
// a common negation idiom and the {{WS}} variable isn't a drop-in
// replacement (it's a positive class, not a single char).

import type { Rule } from "eslint";
import {
  findPair,
  isMapping,
  isRuleMapping,
  isScalar,
  rangeInScalar,
  scalarKey,
  type YAMLMapping,
  type YAMLScalar,
} from "../utils/yaml-ast.ts";
import { scanRegex } from "../utils/regex-scan.ts";

const PATTERN_KEYS = ["match", "begin", "end"] as const;

function findRawWhitespaceEscapes(source: string): number[] {
  const hits: number[] = [];
  for (const tok of scanRegex(source)) {
    if (tok.text === "\\s" && !tok.inCharClass) hits.push(tok.index);
  }
  return hits;
}

function reportOnScalar(
  context: Rule.RuleContext,
  scalar: YAMLScalar,
  source: string,
): void {
  const hits = findRawWhitespaceEscapes(source);
  for (const offset of hits) {
    context.report({
      loc: rangeInScalar(context, scalar, offset, 2),
      messageId: "rawWhitespace",
    });
  }
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow top-level `\\s` in grammar regexes; use `{{WS}}` (or the appropriate variable) instead.",
    },
    schema: [],
    messages: {
      rawWhitespace:
        "`\\s` crosses newlines. Use `{{WS}}` (or the appropriate whitespace variable). See GRAMMAR.md §12.",
    },
  },
  create(context) {
    return {
      YAMLMapping(node: unknown) {
        const mapping = node as YAMLMapping;
        if (!isMapping(mapping)) return;

        // Top-level `variables:` block — check each value.
        const containerPair = mapping.parent;
        if (
          containerPair?.type === "YAMLPair" &&
          scalarKey(containerPair) === "variables"
        ) {
          for (const pair of mapping.pairs) {
            if (isScalar(pair.value) && typeof pair.value.value === "string") {
              reportOnScalar(
                context,
                pair.value as YAMLScalar,
                pair.value.value,
              );
            }
          }
          return;
        }

        // Rule mappings — check match/begin/end values.
        if (!isRuleMapping(mapping)) return;
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
