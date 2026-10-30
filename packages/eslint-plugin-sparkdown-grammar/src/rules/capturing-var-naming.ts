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
        continue;
      }
      if (after === "<") {
        count++;
        continue;
      }
      if (after === "P" && pattern[i + 3] === "<") {
        count++;
        continue;
      }
      count++;
    }
  }
  return count;
}

const TOKEN_REGEX = /\{\{([A-Za-z0-9_]+)\}\}/g;

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
