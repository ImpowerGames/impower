import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";

const classes = (repository: string, variables?: string) =>
  lintRule(grammar({ repository, variables }), "no-line-crossing-class").map(
    (m) => m.message.match(/`(\[[^`]*\])`/)![1],
  );

test("a repeated negated class that admits a line break fails", () => {
  assert.deepEqual(classes(`Rule:
  begin: (match)(?=[(][^()]*[)]{{WS}}*[|])
  end: $`), ["[^()]"]);
});

test("a negated class in a repeated group fails", () => {
  assert.deepEqual(classes(`Rule:
  match: ([<])((?:\\\\.|[^>])*?)([>])`), ["[^>]"]);
});

test("a negated class with more pattern after it fails", () => {
  assert.deepEqual(classes(`Rule:
  match: ([^x])(y)`), ["[^x]"]);
});

test("the same classes pass once they exclude the line break", () => {
  assert.deepEqual(classes(`Rule:
  begin: (match)(?=[(][^()\\r\\n]*[)])
  end: $
Other:
  match: ([<])((?:\\\\.|[^>\\r\\n])*?)([>])`), []);
});

test("a class that can only read the line's own break passes", () => {
  assert.deepEqual(classes(`Rule:
  match: (=)(?=[^{])`), []);
});

test("a class inside a lookbehind passes", () => {
  assert.deepEqual(classes(`Rule:
  match: (?<=[^-]>)(x)`), []);
});

test("a class that cannot match a line break passes", () => {
  assert.deepEqual(classes(`Rule:
  match: ([^\\s,]+)([^\\S\\n\\r]*)`), []);
});

test("a variable's class is checked as written", () => {
  assert.deepEqual(classes(`Rule:
  match: "{{QUOTED}}"`, "QUOTED: (?:\"[^\"]*\")"), ["[^\"]"]);
});

test("a baselined owner reports nothing until it gains a finding", () => {
  const source = grammar({
    variables: "TRIVIA: (?:[^\\]]*\\])",
  });
  assert.deepEqual(
    lintRule(source, "no-line-crossing-class", { "variables.TRIVIA": 1 }),
    [],
  );
  assert.equal(lintRule(source, "no-line-crossing-class").length, 1);
});
