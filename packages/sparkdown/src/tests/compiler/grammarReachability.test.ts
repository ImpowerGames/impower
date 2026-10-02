// Every repository rule in the grammar should be reachable from the top-level
// `patterns` through `include: "#Name"` references, and every variable should be
// expanded somewhere (`{{NAME}}`) or read from TypeScript. A rule nothing
// includes still reads as live to the next author, and it inflates the counts
// the grammar lints report (#1268, #1277).
//
// The remaining unreachable rules and unused variables are listed below, so
// this test fails both when a new dead one appears and when a listed one is
// removed or used again without updating the list. Remove each name here as its follow-up
// lands.

import { describe, expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import YAML from "yaml";

function findUp(rel: string): string {
  let dir = resolve(process.cwd());
  for (;;) {
    const candidate = join(dir, rel);
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) throw new Error(`could not find ${rel}`);
    dir = parent;
  }
}

const SOURCE = YAML.parse(
  readFileSync(
    findUp(join("definitions", "yaml", "sparkdown.language-grammar.yaml")),
    "utf8",
  ),
) as {
  patterns: unknown[];
  repository: Record<string, unknown>;
  variables: Record<string, unknown>;
};

// Rules left unreachable once #1277 removed their only includers. Tracked by
// the follow-up Task filed from PR #1331.
const KNOWN_UNREACHABLE_RULES = [
  "InvalidSelectorPropertyName",
  "LuauStyleAssignmentMark",
  "LuauStylePropertyName",
  "LuauStylePropertyValue",
  "LuauUIAttribute",
  "LuauUIAttributeEquals",
  "LuauUIAttributeName",
  "LuauUIAttributeSigil",
  "LuauUIAttributeValue",
  "LuauUIContent",
  "LuauUIContentText",
  "LuauUIQuote",
  "OperatorPrefixedPropertyName",
];

// Variables read directly from `GRAMMAR_DEFINITION.variables` in TypeScript
// rather than expanded in a pattern.
const VARIABLES_READ_FROM_TYPESCRIPT = ["FLOW_MODULE_KEYWORDS"];

// Variables nothing expands, outside #1277's list. Tracked by the same
// follow-up Task.
const KNOWN_UNUSED_VARIABLES = ["SPARKLE_HEAD", "_LUAU_SEMICOLON_AHEAD_"];

function visit(node: unknown, onString: (s: string) => void): void {
  if (typeof node === "string") {
    onString(node);
  } else if (Array.isArray(node)) {
    for (const item of node) visit(item, onString);
  } else if (node && typeof node === "object") {
    for (const value of Object.values(node)) visit(value, onString);
  }
}

function includesOf(node: unknown): string[] {
  const found: string[] = [];
  const walk = (n: unknown): void => {
    if (Array.isArray(n)) {
      for (const item of n) walk(item);
    } else if (n && typeof n === "object") {
      for (const [key, value] of Object.entries(n)) {
        if (key === "include" && typeof value === "string") {
          if (value.startsWith("#")) found.push(value.slice(1));
        } else {
          walk(value);
        }
      }
    }
  };
  walk(node);
  return found;
}

function reachableRules(): Set<string> {
  const reached = new Set<string>();
  const queue = includesOf(SOURCE.patterns);
  while (queue.length) {
    const name = queue.pop()!;
    if (reached.has(name)) continue;
    reached.add(name);
    queue.push(...includesOf(SOURCE.repository[name]));
  }
  return reached;
}

describe("grammar reachability", () => {
  test("only the known follow-up rules are unreachable from the top-level patterns", () => {
    const reached = reachableRules();
    const unreachable = Object.keys(SOURCE.repository)
      .filter((name) => !reached.has(name))
      .sort();
    expect(unreachable).toEqual([...KNOWN_UNREACHABLE_RULES].sort());
  });

  test("only the known follow-up variables are neither expanded nor read from TypeScript", () => {
    const used = new Set<string>(VARIABLES_READ_FROM_TYPESCRIPT);
    const collect = (s: string) => {
      for (const match of s.matchAll(/\{\{(\w+)\}\}/g)) used.add(match[1]!);
    };
    visit(SOURCE.patterns, collect);
    visit(SOURCE.repository, collect);
    visit(SOURCE.variables, collect);
    const unused = Object.keys(SOURCE.variables)
      .filter((v) => !used.has(v))
      .sort();
    expect(unused).toEqual([...KNOWN_UNUSED_VARIABLES].sort());
  });
});
