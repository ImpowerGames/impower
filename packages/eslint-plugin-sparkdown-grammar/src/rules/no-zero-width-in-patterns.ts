import type { Rule } from "eslint";
import {
  findPair,
  getStringValue,
  isMapping,
  isSequence,
  scalarKey,
  type YAMLMapping,
  type YAMLNode,
  type YAMLPair,
  type YAMLSequence,
} from "../utils/yaml-ast.ts";

interface RuleShape {
  hasMatch: boolean;
  hasBeginOrEnd: boolean;
  resolvedMatch?: string;
  patternIncludes: string[];
}

function isUnconditionallyZeroWidth(source: string): boolean {
  const PROBES = ["x", " ", "\n", "(", "1"];
  try {
    const re = new RegExp(source, "y");
    for (const probe of PROBES) {
      re.lastIndex = 0;
      const m = re.exec(probe);
      if (m !== null && m[0] === "" && re.lastIndex === 0) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function buildVariables(root: YAMLMapping): Record<string, string> {
  const out: Record<string, string> = {};
  const variablesPair = findPair(root, "variables");
  if (!variablesPair || !isMapping(variablesPair.value)) return out;
  for (const pair of (variablesPair.value as YAMLMapping).pairs) {
    const key = scalarKey(pair);
    if (!key) continue;
    const value = pair.value;
    if (value && value.type === "YAMLScalar" && typeof value.value === "string") {
      out[key] = value.value;
    } else if (value && value.type === "YAMLSequence") {
      const items: string[] = [];
      for (const entry of (value as YAMLSequence).entries) {
        if (
          entry &&
          entry.type === "YAMLScalar" &&
          typeof entry.value === "string"
        ) {
          items.push(entry.value);
        }
      }
      out[key] = `\\b(?:${items.join("|")})\\b`;
    }
  }
  return out;
}

function resolveVariables(rawPatterns: Record<string, string>): Record<string, string> {
  const TOKEN_REGEX = /{{([A-Za-z_][A-Za-z0-9_]*)}}/g;
  const isFullyResolved = (s: string): boolean => {
    TOKEN_REGEX.lastIndex = 0;
    return !TOKEN_REGEX.test(s);
  };
  const out = { ...rawPatterns };
  const MAX_PASSES = 32;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    for (const name of Object.keys(out)) {
      const before = out[name]!;
      const after = before.replace(TOKEN_REGEX, (whole, refName: string) => {
        const ref = out[refName];
        return ref !== undefined && isFullyResolved(ref) ? ref : whole;
      });
      if (after !== before) {
        out[name] = after;
        changed = true;
      }
    }
    if (!changed) break;
  }
  return out;
}

function substitute(
  pattern: string,
  variables: Record<string, string>,
): string {
  const TOKEN_REGEX = /{{([A-Za-z_][A-Za-z0-9_]*)}}/g;
  return pattern.replace(TOKEN_REGEX, (whole, name: string) =>
    variables[name] ?? whole,
  );
}

function buildRuleMap(
  root: YAMLMapping,
  variables: Record<string, string>,
): Map<string, RuleShape> {
  const rules = new Map<string, RuleShape>();
  const repoPair = findPair(root, "repository");
  if (!repoPair || !isMapping(repoPair.value)) return rules;
  for (const pair of (repoPair.value as YAMLMapping).pairs) {
    const name = scalarKey(pair);
    if (!name || !isMapping(pair.value)) continue;
    const m = pair.value as YAMLMapping;
    const shape: RuleShape = {
      hasMatch: !!findPair(m, "match"),
      hasBeginOrEnd: !!(findPair(m, "begin") || findPair(m, "end")),
      patternIncludes: [],
    };
    const matchValue = getStringValue(m, "match");
    if (matchValue) {
      shape.resolvedMatch = substitute(matchValue.value, variables);
    }
    const patternsPair = findPair(m, "patterns");
    if (patternsPair && isSequence(patternsPair.value)) {
      for (const entry of (patternsPair.value as YAMLSequence).entries) {
        if (!isMapping(entry)) continue;
        const include = getStringValue(entry as YAMLMapping, "include");
        if (include && include.value.startsWith("#")) {
          shape.patternIncludes.push(include.value.slice(1));
        }
      }
    }
    rules.set(name, shape);
  }
  return rules;
}

function computeEffectivelyZeroWidth(rules: Map<string, RuleShape>): Set<string> {
  const zw = new Set<string>();
  for (const [name, shape] of rules) {
    if (shape.resolvedMatch && isUnconditionallyZeroWidth(shape.resolvedMatch)) {
      zw.add(name);
    }
  }
  for (let pass = 0; pass < rules.size + 1; pass++) {
    let changed = false;
    for (const [name, shape] of rules) {
      if (zw.has(name)) continue;
      if (shape.hasMatch || shape.hasBeginOrEnd) continue;
      if (shape.patternIncludes.some((inc) => zw.has(inc))) {
        zw.add(name);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return zw;
}

const rule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow zero-width-matchable rules from being included in any `patterns:` list (direct or transitive via a Switch).",
    },
    schema: [],
    messages: {
      zeroWidthInPatterns:
        "Rule `{{target}}` is zero-width-matchable and cannot be included in a `patterns:` list — it would wedge the parser's dispatch loop with no progress. Use `ExtraWhitespace` / `RequiredWhitespace` / `Whitespace` (all `{{WS}}+`) inside `patterns:`; reserve zero-width rules for capture targets. See GRAMMAR.md §12.",
    },
  },
  create(context) {
    let effectivelyZW: Set<string> | null = null;

    function ensureComputed(node: YAMLNode | null): void {
      if (effectivelyZW !== null) return;
      let cur: YAMLNode | null = node;
      while (cur && !(isMapping(cur) && cur.parent?.type === "YAMLDocument")) {
        cur = cur.parent;
      }
      if (!cur || !isMapping(cur)) {
        effectivelyZW = new Set();
        return;
      }
      const root = cur as YAMLMapping;
      const variables = resolveVariables(buildVariables(root));
      const rules = buildRuleMap(root, variables);
      effectivelyZW = computeEffectivelyZeroWidth(rules);
    }

    const isCaptureHandlerPatterns = (pair: YAMLPair): boolean => {
      let cur: YAMLNode | null = pair.parent;
      while (cur) {
        if (cur.type === "YAMLPair") {
          const key = scalarKey(cur as YAMLPair);
          if (
            key === "captures" ||
            key === "beginCaptures" ||
            key === "endCaptures"
          ) {
            return true;
          }
          if (
            key === "repository" ||
            key === "patterns" ||
            key === "rules"
          ) {
            return false;
          }
        }
        cur = cur.parent;
      }
      return false;
    };

    return {
      YAMLPair(node: unknown) {
        const pair = node as YAMLPair;
        if (scalarKey(pair) !== "patterns") return;
        const seq = pair.value;
        if (!isSequence(seq)) return;
        if (isCaptureHandlerPatterns(pair)) return;
        ensureComputed(pair);
        if (!effectivelyZW || effectivelyZW.size === 0) return;
        for (const entry of (seq as YAMLSequence).entries) {
          if (!isMapping(entry)) continue;
          const include = getStringValue(entry as YAMLMapping, "include");
          if (!include || !include.value.startsWith("#")) continue;
          const target = include.value.slice(1);
          if (effectivelyZW.has(target)) {
            context.report({
              loc: include.node.loc,
              messageId: "zeroWidthInPatterns",
              data: { target },
            });
          }
        }
      },
    };
  },
};

export default rule;
