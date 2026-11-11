import assert from "node:assert/strict";
import { test } from "node:test";
import type { Linter } from "eslint";
import plugin from "../index.ts";
import { lintRules, readGrammarSource } from "../utils/lint-fixture.ts";

const STORY = readGrammarSource("story");
const RECOMMENDED = (plugin.configs["recommended"] as { rules: Linter.RulesRecord })
  .rules;

test("the grammar has no findings beyond the baseline", () => {
  for (const as of ["story", "luau"] as const) {
    const messages = lintRules(readGrammarSource(as), RECOMMENDED, as);
    assert.deepEqual(
      messages.map((m) => `${as} ${m.line}: ${m.ruleId}: ${m.message}`),
      [],
    );
  }
});

test("a new negative lookahead in the grammar is an error", () => {
  const changed = STORY.replace(
    /^( {2}Newline:\n(?: {4}.*\n)*? {4}match: )(.*)$/m,
    "$1(?!zz)$2",
  );
  assert.notEqual(changed, STORY, "fixture rule not found");
  const messages = lintRules(changed, RECOMMENDED, "story");
  assert.deepEqual(
    messages.map((m) => [m.ruleId, m.severity]),
    [["sparkdown-grammar/lookaround-needs-rival-comment", 2]],
  );
});

test("a rule or variable whose prefix names the other source fails", () => {
  const rule = "sparkdown-grammar/prefix-matches-file";
  const story = STORY.replace(
    /^repository:\n/m,
    "repository:\n  LuauMisplaced:\n    match: x\n",
  ).replace(/^variables:\n/m, "variables:\n  _LUAU_MISPLACED_: (x)\n");
  const luau = readGrammarSource("luau")
    .replace(/^repository:\n/m, "repository:\n  Misplaced:\n    match: x\n")
    .replace(/^variables:\n/m, "variables:\n  MISPLACED: x\n");
  const found = (source: string, as: "story" | "luau") =>
    lintRules(source, { [rule]: "error" }, as)
      .filter((m) => m.ruleId === rule)
      .map((m) => m.message.match(/^\w+ `(\w+)`/)?.[1] ?? m.message);
  assert.deepEqual(found(story, "story"), ["_LUAU_MISPLACED_", "LuauMisplaced"]);
  assert.deepEqual(found(luau, "luau"), ["MISPLACED", "Misplaced"]);
  assert.deepEqual(found(STORY, "story"), []);
  assert.deepEqual(found(readGrammarSource("luau"), "luau"), []);
});
