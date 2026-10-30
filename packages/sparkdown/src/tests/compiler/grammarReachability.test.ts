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
  luauFile: { rule: string };
  repository: Record<string, unknown>;
  variables: Record<string, unknown>;
};

const KNOWN_UNREACHABLE_RULES = [] as string[];

const VARIABLES_READ_FROM_TYPESCRIPT = ["FLOW_MODULE_KEYWORDS", "LUAU_LOCAL_DECLARATION_KEYWORDS", "LUAU_LOOP_BLOCK_KEYWORDS"];

const KNOWN_UNUSED_VARIABLES = [] as string[];

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
  const queue = [...includesOf(SOURCE.patterns), SOURCE.luauFile.rule];
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
