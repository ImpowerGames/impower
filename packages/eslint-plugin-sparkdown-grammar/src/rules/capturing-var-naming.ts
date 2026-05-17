// Rule: any `variables:` entry whose resolved (or even raw) pattern
// contains an unescaped *capturing* group must be named with the
// underscore-wrapped convention `_NAME_`. Mirrors the build-time check
// in `definitions/src/language.ts > updateGrammarVariables` so authors
// see the violation while editing instead of at build time. See
// GRAMMAR.md §4.4 for why the convention matters: the underscores
// visually flag at every use site that the variable adds capture
// indices to the host rule's regex.

import type { Rule } from "eslint";
import {
  isMapping,
  isScalar,
  isSequence,
  scalarKey,
  type YAMLMapping,
  type YAMLNode,
  type YAMLPair,
} from "../utils/yaml-ast.ts";

// Counts unescaped capturing groups in a regex source string. Same
// definition as `countCapturingGroups` in definitions/src/language.ts:
// `(` is a capture unless preceded by `\`, inside a `[...]` class, or
// followed by `?:` / `?=` / `?!` / `?<=` / `?<!`. Named captures
// `(?<name>...)` / `(?P<name>...)` DO count.
function countCapturingGroups(pattern: string): number {
  let count = 0;
  let inCharClass = false;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]!;
    if (ch === "\\") {
      i++;
      continue;
    }
    if (inCharClass) {
      if (ch === "]") inCharClass = false;
      continue;
    }
    if (ch === "[") {
      inCharClass = true;
      continue;
    }
    if (ch === "(") {
      const next = pattern[i + 1];
      if (next !== "?") {
        count++;
        continue;
      }
      const after = pattern[i + 2];
      if (
        after === ":" ||
        after === "=" ||
        after === "!" ||
        (after === "<" &&
          (pattern[i + 3] === "=" || pattern[i + 3] === "!"))
      ) {
        // Non-capturing or lookbehind — skip.
        continue;
      }
      // `(?<name>` and `(?P<name>` — named captures, count.
      if (after === "<") {
        count++;
        continue;
      }
      if (after === "P" && pattern[i + 3] === "<") {
        count++;
        continue;
      }
      // Unknown `(?...)` — conservatively count as capturing.
      count++;
    }
  }
  return count;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Variable names must be underscore-wrapped (`_NAME_`) iff their values contain unescaped capture groups.",
    },
    schema: [],
    messages: {
      missingUnderscores:
        "Variable `{{name}}` contains {{count}} capturing group(s) but isn't underscore-wrapped. Either change the capture(s) to non-capturing (`(?:...)`) or rename to `_{{name}}_`. See GRAMMAR.md §4.4.",
      extraUnderscores:
        "Variable `{{name}}` is underscore-wrapped (signals it contains capture groups) but its value has no capturing groups. Drop the underscores. See GRAMMAR.md §4.4.",
    },
  },
  create(context) {
    return {
      YAMLPair(node: unknown) {
        const pair = node as YAMLPair;
        const parent = pair.parent;
        if (!isMapping(parent)) return;
        const parentPair = parent.parent;
        if (
          parentPair?.type !== "YAMLPair" ||
          scalarKey(parentPair) !== "variables"
        ) {
          return;
        }
        const name = scalarKey(pair);
        if (!name) return;

        // The value can be a string scalar OR a sequence (auto-wrapped
        // by the build to `\b(?:a|b|c)\b`). Sequences never introduce
        // capture groups — they're always non-capturing — so we can
        // short-circuit.
        const value = pair.value as YAMLNode | null;
        let rawPattern = "";
        if (isScalar(value) && typeof value.value === "string") {
          rawPattern = value.value;
        } else if (isSequence(value)) {
          rawPattern = "";
        } else {
          return;
        }

        const captures = countCapturingGroups(rawPattern);
        const isUnderscoreWrapped =
          name.startsWith("_") && name.endsWith("_") && name.length > 2;

        if (captures > 0 && !isUnderscoreWrapped) {
          context.report({
            loc: pair.key?.loc ?? pair.loc,
            messageId: "missingUnderscores",
            data: { name, count: String(captures) },
          });
        } else if (captures === 0 && isUnderscoreWrapped) {
          context.report({
            loc: pair.key?.loc ?? pair.loc,
            messageId: "extraUnderscores",
            data: { name },
          });
        }
      },
    };
  },
};

export default rule;
