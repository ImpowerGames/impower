// End to end: the recommended configuration with the committed baseline
// passes the grammar as it is, and fails it once a rule gains a new
// unjustified lookaround.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import type { Linter } from "eslint";
import plugin from "../index.ts";
import { lintRules } from "../utils/lint-fixture.ts";

const GRAMMAR = readFileSync(
  new URL(
    "../../../../definitions/yaml/sparkdown.language-grammar.yaml",
    import.meta.url,
  ),
  "utf8",
);
const RECOMMENDED = (plugin.configs["recommended"] as { rules: Linter.RulesRecord })
  .rules;

test("the grammar has no findings beyond the baseline", () => {
  const messages = lintRules(GRAMMAR, RECOMMENDED);
  assert.deepEqual(
    messages.map((m) => `${m.line}: ${m.ruleId}: ${m.message}`),
    [],
  );
});

test("a new negative lookahead in the grammar is an error", () => {
  // `Newline` carries no lookaround and no baseline entry.
  const changed = GRAMMAR.replace(
    /^( {2}Newline:\n(?: {4}.*\n)*? {4}match: )(.*)$/m,
    "$1(?!zz)$2",
  );
  assert.notEqual(changed, GRAMMAR, "fixture rule not found");
  const messages = lintRules(changed, RECOMMENDED);
  assert.deepEqual(
    messages.map((m) => [m.ruleId, m.severity]),
    [["sparkdown-grammar/lookaround-needs-rival-comment", 2]],
  );
});
