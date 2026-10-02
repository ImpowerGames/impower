import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";

const names = (source: string) =>
  lintRule(source, "no-unreferenced-variable").map(
    (m) => m.message.match(/^Variable `([^`]+)`/)![1],
  );

test("an expanded variable passes and an unexpanded one fails", () => {
  const source = grammar({
    variables: `WS: (?:[ ])
INNER: (?:i)
OUTER: (?:{{INNER}})
KEYWORDS: ["a", "b"]
UNUSED: (?:u)`,
    repository: `Rule:
  match: ({{WS}})({{OUTER}})
  captures:
    1: { patterns: [{ match: "{{KEYWORDS}}" }] }`,
  });
  assert.deepEqual(names(source), ["UNUSED"]);
});

test("a `# referenced-from:` comment exempts a variable TypeScript reads", () => {
  const source = grammar({
    variables: `# referenced-from: packages/example/src/completions.ts
READ_FROM_TS: ["include", "run"]`,
  });
  assert.deepEqual(names(source), []);
});

test("block-scalar text is not a `# referenced-from:` comment", () => {
  const source = grammar({
    variables: `TEXT: |-
  # referenced-from: reader.ts
UNUSED: x`,
  });
  assert.deepEqual(names(source), ["TEXT", "UNUSED"]);
});

test("a mention outside a pattern, or in the variable itself, is not a use", () => {
  const source = grammar({
    variables: "SELF: (?:{{SELF}})\nMENTIONED: (?:x)",
    repository: `Rule:
  comment: "{{MENTIONED}}"
  match: a`,
  });
  assert.deepEqual(names(source), ["SELF", "MENTIONED"]);
});
