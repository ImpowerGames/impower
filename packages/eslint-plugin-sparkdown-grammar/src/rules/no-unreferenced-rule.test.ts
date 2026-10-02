import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";
import { collectFindings } from "../baseline-cli.ts";

const names = (source: string) =>
  lintRule(source, "no-unreferenced-rule").map(
    (m) => m.message.match(/^Rule `([^`]+)`/)![1],
  );

test("a rule reached from the top-level patterns passes; one reached only from dead rules fails", () => {
  const source = grammar({
    patterns: '- include: "#Root"',
    repository: `Root:
  patterns:
    - include: "#Child"
Child:
  begin: a
  end: b
  beginCaptures:
    1: { patterns: [{ include: "#Captured" }] }
Captured:
  match: c
Dead:
  patterns:
    - include: "#OnlyFromDead"
OnlyFromDead:
  match: d`,
  });
  assert.deepEqual(names(source), ["Dead", "OnlyFromDead"]);
});

test("a `# referenced-from:` comment exempts a rule and what it includes", () => {
  const source = grammar({
    repository: `# Read by name when completing.
# referenced-from: packages/example/src/reader.ts
FromTypeScript:
  patterns:
    - include: "#Helper"
Helper:
  match: h`,
  });
  assert.deepEqual(names(source), []);
});

// The reachability test pins the grammar's unreachable rules and unused
// variables; this rule and no-unreferenced-variable must find the same.
test("findings on the grammar agree with grammarReachability.test.ts", () => {
  const root = new URL("../../../../", import.meta.url);
  const reachability = readFileSync(
    new URL(
      "packages/sparkdown/src/tests/compiler/grammarReachability.test.ts",
      root,
    ),
    "utf8",
  );
  const list = (name: string): string[] => {
    const body = reachability.match(
      new RegExp(`const ${name} = \\[([^\\]]*)\\]`),
    );
    assert.ok(body, `${name} not found in grammarReachability.test.ts`);
    return [...body[1]!.matchAll(/"([^"]+)"/g)].map((m) => m[1]!).sort();
  };
  const source = readFileSync(
    new URL("definitions/yaml/sparkdown.language-grammar.yaml", root),
    "utf8",
  );
  const found = collectFindings(source);
  const owners = (rule: string, prefix: string) =>
    found[rule]!.map((f) => f.owner.slice(prefix.length)).sort();
  assert.deepEqual(
    owners("no-unreferenced-rule", "repository."),
    list("KNOWN_UNREACHABLE_RULES"),
  );
  assert.deepEqual(
    owners("no-unreferenced-variable", "variables."),
    list("KNOWN_UNUSED_VARIABLES"),
  );
  // Without the `# referenced-from:` comments, the variables TypeScript
  // reads are reported too.
  const uncommented = collectFindings(
    source.replace(/^\s*# referenced-from:.*$/gm, "#"),
  );
  assert.deepEqual(
    uncommented["no-unreferenced-variable"]!
      .map((f) => f.owner.slice("variables.".length))
      .sort(),
    [
      ...list("KNOWN_UNUSED_VARIABLES"),
      ...list("VARIABLES_READ_FROM_TYPESCRIPT"),
    ].sort(),
  );
});
