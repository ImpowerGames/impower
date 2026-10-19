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
  end: $`, "WS: (?:[^\\S\\n\\r])"), ["[^()]"]);
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

// SparkdownDocumentRegistry turns every line break into `\n`, so a class
// that excludes `\n` alone keeps the pattern on its line.
test("a class that excludes only the line feed passes", () => {
  assert.deepEqual(classes(`Rule:
  match: ([(][^()\\n]*[)])`), []);
});

test("a class a variable brings in is checked where a rule repeats it", () => {
  assert.deepEqual(classes(`Rule:
  match: "[(]{{CHAR}}*[)]"`, "CHAR: (?:[^()])"), ["[^()]"]);
});

test("a variable used only inside a lookbehind passes", () => {
  assert.deepEqual(classes(`Rule:
  match: (?<={{BEFORE}})(x)`, "BEFORE: (?:[^-]>)"), []);
});

test("a variable that reads past the line on purpose says why and passes", () => {
  const variables = `# reads-past-line: skips blank and comment lines to the next token.
TRIVIA: (?:[^\\]]*\\])`;
  assert.deepEqual(classes(`Rule:
  match: "(x)(?={{TRIVIA}}y)"`, variables), []);
  assert.deepEqual(
    classes(`Rule:
  match: "(x)(?={{TRIVIA}}y)"`, "TRIVIA: (?:[^\\]]*\\])"),
    ["[^\\]]"],
  );
});
