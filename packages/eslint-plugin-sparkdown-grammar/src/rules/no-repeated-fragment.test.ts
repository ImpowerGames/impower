import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";

const lint = (source: string) =>
  lintRule(source, "no-repeated-fragment").map((m) => [m.line, m.message]);

test("a long group repeated across patterns fails; a short or single one passes", () => {
  const repeated = grammar({
    repository: `A:
  match: x(?:alpha|beta|gamma)
B:
  begin: (?:alpha|beta|gamma)y
  end: (?:ab|cd)
C:
  match: (?:ab|cd)`,
  });
  const messages = lint(repeated);
  assert.deepEqual(
    messages.map(([line]) => line),
    [4, 6],
  );
  assert.match(String(messages[0]![1]), /appears verbatim in 2 patterns \(also B\.begin\)/);
  const once = grammar({
    repository: `A:
  match: x(?:alpha|beta|gamma)`,
  });
  assert.deepEqual(lint(once), []);
});

test("only the outermost repeated group is reported", () => {
  const source = grammar({
    repository: `A:
  match: (?:(?:alpha|beta)|gamma-delta)
B:
  match: z(?:(?:alpha|beta)|gamma-delta)`,
  });
  const messages = lint(source);
  assert.equal(messages.length, 2);
  assert.match(String(messages[0]![1]), /`\(\?:\(\?:alpha\|beta\)\|gamma-delta\)`/);
});

test("a variable holding the fragment is the named copy and is suggested", () => {
  const source = grammar({
    variables: "GREEK: (?:alpha|beta|gamma)",
    repository: `A:
  match: x(?:alpha|beta|gamma)`,
  });
  const messages = lint(source);
  assert.deepEqual(
    messages.map(([line]) => line),
    [6],
  );
  assert.match(String(messages[0]![1]), /Use `\{\{GREEK\}\}` instead/);
});

test("array variable entries count as patterns", () => {
  const source = grammar({
    variables: 'GREEK: ["(?:alpha|beta|gamma)", "delta"]',
    repository: `A:
  match: x(?:alpha|beta|gamma)`,
  });
  assert.deepEqual(
    lint(source).map(([line]) => line),
    [2, 6],
  );
});
