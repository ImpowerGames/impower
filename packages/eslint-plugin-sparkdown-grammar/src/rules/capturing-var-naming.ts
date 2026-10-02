// Rule: any `variables:` entry whose resolved pattern (after every
// `{{NAME}}` reference is substituted) contains an unescaped *capturing*
// group must be named with the underscore-wrapped convention `_NAME_`.
// Mirrors the build-time check in
// `definitions/src/language.ts > updateGrammarVariables`, which counts
// captures in resolved values, so authors see the violation while editing
// instead of at build time. A variable that only references a capturing
// variable inherits its captures and must be underscore-wrapped too. See
// GRAMMAR.md §7.4 for why the convention matters: the underscores
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
        (after === "<" && (pattern[i + 3] === "=" || pattern[i + 3] === "!"))
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

const TOKEN_REGEX = /\{\{([A-Za-z0-9_]+)\}\}/g;

// Raw values of every entry in a `variables:` mapping. A sequence gets the
// build's `\b(?:a|b)\b` wrapping, keeping its entries' text: the wrapper
// adds no capture, but an entry may hold one.
function rawVariables(mapping: YAMLMapping): Map<string, string> {
  const raw = new Map<string, string>();
  for (const pair of mapping.pairs) {
    const name = scalarKey(pair);
    const value = pair.value as YAMLNode | null;
    if (!name) continue;
    if (isScalar(value) && typeof value.value === "string") {
      raw.set(name, value.value);
    } else if (isSequence(value)) {
      const entries = value.entries.map((entry) =>
        isScalar(entry) && entry.value !== null ? String(entry.value) : "",
      );
      raw.set(name, `\\b(?:${entries.join("|")})\\b`);
    }
  }
  return raw;
}

// Substitutes references recursively. Undefined names and cycles are left
// as literal tokens (the build reports those), and tokens hold no `(`.
function resolve(
  name: string,
  raw: Map<string, string>,
  memo: Map<string, string>,
  visiting: Set<string>,
): string {
  const cached = memo.get(name);
  if (cached !== undefined) return cached;
  const value = raw.get(name);
  if (value === undefined || visiting.has(name)) return `{{${name}}}`;
  visiting.add(name);
  const resolved = value.replace(TOKEN_REGEX, (_, ref: string) =>
    resolve(ref, raw, memo, visiting),
  );
  visiting.delete(name);
  memo.set(name, resolved);
  return resolved;
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
        "Variable `{{name}}` contains {{count}} capturing group(s) but isn't underscore-wrapped. Either change the capture(s) to non-capturing (`(?:...)`) or rename to `_{{name}}_`. See GRAMMAR.md §7.4.",
      extraUnderscores:
        "Variable `{{name}}` is underscore-wrapped (signals it contains capture groups) but its resolved value has no capturing groups. Drop the underscores. See GRAMMAR.md §7.4.",
    },
  },
  create(context) {
    const resolvedByMapping = new Map<
      YAMLMapping,
      { raw: Map<string, string>; memo: Map<string, string> }
    >();
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

        // A string or a sequence (auto-wrapped by the build to
        // `\b(?:a|b|c)\b`) counts the captures in its resolved value.
        const value = pair.value as YAMLNode | null;
        if (
          !isSequence(value) &&
          !(isScalar(value) && typeof value.value === "string")
        ) {
          return;
        }
        let cache = resolvedByMapping.get(parent);
        if (!cache) {
          cache = { raw: rawVariables(parent), memo: new Map() };
          resolvedByMapping.set(parent, cache);
        }
        const rawPattern = resolve(name, cache.raw, cache.memo, new Set());

        const captures = countCapturingGroups(rawPattern);
        // The same test as the build's, so `_` and `__` count as wrapped.
        const isUnderscoreWrapped = name.startsWith("_") && name.endsWith("_");

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
