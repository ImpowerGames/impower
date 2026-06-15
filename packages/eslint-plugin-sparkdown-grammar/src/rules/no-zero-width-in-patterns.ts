// Rule: refuse to include a zero-width-matchable rule in any rule's
// `patterns:` list — whether the include is direct, or transitive
// through a `Switch` rule (one with only `patterns:`, no `match`/
// `begin`/`end`). Mirrors the build-time check in
// `definitions/src/language.ts > checkNoZeroWidthInPatterns`. See
// GRAMMAR.md §12 for the convention.
//
// The classic offender is `OptionalWhitespace` (`match: ({{WS}}*)`) —
// it's meant to be used as a capture target, where a zero-width match
// is the natural "no whitespace here" signal. Inside a `patterns:`
// dispatch loop, the same zero-width match wedges the loop with no
// progress and trips the parser's
//   `[ScopedRule:...] Too many consecutive empty matches at pos=...`
// warning. Capture-level use is left alone; only `patterns:`
// inclusion is rejected.

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

// Same probe-based check used by the build pipeline. A regex is
// "unconditionally zero-width" iff it sticky-matches at position 0
// with length 0 against ANY of these probe inputs. Lookaround-anchored
// patterns (e.g. `(?=$|]])`) only fire at specific positions and fail
// every probe — they're correctly allowed.
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
      // Array-of-strings → auto-wrapped to `\b(?:a|b|c)\b`.
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

// Fixed-point variable substitution (same loop as the build).
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

// Walks `repository:` and collects every rule's shape.
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
  // Propagate through Switch rules (no match, no begin/end — pure
  // dispatchers). A Switch is effectively zero-width if any include
  // resolves to a known zero-width rule.
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
    // Lazily compute the effectively-zero-width set once we encounter
    // the document root. ESLint visits the program top-down so the
    // document mapping fires before any nested patterns: sequence.
    let effectivelyZW: Set<string> | null = null;

    function ensureComputed(node: YAMLNode | null): void {
      if (effectivelyZW !== null) return;
      // Walk up from any node to find the document root mapping.
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

    // A `patterns:` pair only counts as "rule dispatch" when it's a
    // direct child of a rule mapping (which itself sits under
    // `repository:` or another rule's `patterns:`). The `patterns:`
    // key that appears inside `captures:` / `beginCaptures:` /
    // `endCaptures:` is a different beast — it's the handler applied
    // to a captured substring whose length is already bounded by the
    // outer match, so zero-width inclusions are harmless there.
    const isCaptureHandlerPatterns = (pair: YAMLPair): boolean => {
      // Walk up: pair → its parent mapping → that mapping's parent pair.
      // If THAT pair's key is one of the capture keys (or it's a
      // numeric capture index inside such a block), it's a capture
      // handler.
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
          // Hit a rule-level key — definitively NOT a capture handler.
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
