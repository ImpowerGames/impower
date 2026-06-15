// Rule: every rule that declares `tag` must also declare `name`. Per
// GRAMMAR.md §7, the two attributes target different renderers
// (Lezer/CodeMirror vs VS Code's TextMate engine) and one can't be
// inferred from the other. The asymmetry of *this* rule (we don't
// require `tag` when `name` is present) is intentional: container /
// region rules like `Choice` or `ArmDivert` carry a `name:` to scope
// a region for VS Code themes but have no Lezer tag — their content
// is highlighted by sub-rules via captures.

import type { Rule } from "eslint";
import {
  findPair,
  isMapping,
  isRuleMapping,
  type YAMLMapping,
} from "../utils/yaml-ast.ts";

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require `tag` and `name` to appear together on grammar rules.",
    },
    schema: [],
    messages: {
      missingName:
        "Rule has `tag` but no `name`. VS Code highlighting needs the TextMate scope name too. See GRAMMAR.md §7.",
    },
  },
  create(context) {
    return {
      YAMLMapping(node: unknown) {
        const mapping = node as YAMLMapping;
        if (!isMapping(mapping) || !isRuleMapping(mapping)) return;
        const tagPair = findPair(mapping, "tag");
        const namePair = findPair(mapping, "name");
        if (tagPair && !namePair) {
          context.report({
            loc: tagPair.loc,
            messageId: "missingName",
          });
        }
      },
    };
  },
};

export default rule;
