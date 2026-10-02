import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";

const lint = (source: string) =>
  lintRule(source, "name-long-pattern-parts").map((m) => m.message);

test("two groups pass; a third group fails", () => {
  assert.deepEqual(
    lint(grammar({ repository: "Short:\n  match: (?:a)(?:b)c" })),
    [],
  );
  assert.deepEqual(
    lint(grammar({ repository: "Long:\n  match: (?:a)(?:b)(?:c)" })),
    [
      "Long.match has 3 `(?:…)` groups. Give its parts names as variables, even ones used once. See GRAMMAR.md §7.2.",
    ],
  );
});

test("a lookaround nested in another lookaround fails, in a rule or a variable", () => {
  const source = grammar({
    variables: "AHEAD: (?=a(?<!b)c)",
    repository: "Flat:\n  match: (?=a)(?<!b)c\nNested:\n  match: (?!a(?<=b))c",
  });
  assert.deepEqual(lint(source), [
    "variable AHEAD nests 1 lookaround inside another lookaround. Give its parts names as variables, even ones used once. See GRAMMAR.md §7.2.",
    "Nested.match nests 1 lookaround inside another lookaround. Give its parts names as variables, even ones used once. See GRAMMAR.md §7.2.",
  ]);
});

test("array variable entries are checked", () => {
  assert.deepEqual(
    lint(grammar({ variables: 'WORDS: ["(?:a)(?:b)(?:c)", "d"]' })).length,
    1,
  );
});
