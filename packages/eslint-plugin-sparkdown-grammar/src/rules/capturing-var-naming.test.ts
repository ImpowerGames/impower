// Runs with `node --test` (Node strips the types). The cases pin the rule
// to the build check in `definitions/src/language.ts`, which counts
// captures in each variable's fully resolved value.

import assert from "node:assert/strict";
import { test } from "node:test";
import { Linter } from "eslint";
import yml from "eslint-plugin-yml";
import plugin from "../index.ts";

const FILE = "grammar.yaml";

function lint(variables: string): string[] {
  const linter = new Linter({ configType: "flat" });
  const messages = linter.verify(
    `variables:\n${variables}`,
    [
      ...(yml.configs["flat/base"] as Linter.Config[]),
      {
        files: [FILE],
        plugins: { "sparkdown-grammar": plugin as never },
        rules: { "sparkdown-grammar/capturing-var-naming": "error" },
      },
    ],
    FILE,
  );
  return messages.map((m) => {
    assert.equal(m.ruleId, "sparkdown-grammar/capturing-var-naming", m.message);
    return m.message.match(/^Variable `([^`]+)`/)![1]!;
  });
}

test("a direct capture needs the underscores, and only a capture does", () => {
  assert.deepEqual(lint("  A: (x)\n  _B_: (x)\n  _C_: (?:x)\n  D: (?:x)\n"), [
    "A",
    "_C_",
  ]);
});

test("a capture reached through a reference counts", () => {
  assert.deepEqual(
    lint(
      "  _T_: (y)\n  _WRAPS_: (?:{{_T_}}z)\n  BARE: (?:{{_T_}})\n  _NESTED_: {{_WRAPS_}}\n",
    ),
    ["BARE"],
  );
});

test("a reference declared later in the mapping resolves too", () => {
  assert.deepEqual(lint("  EARLY: (?:{{_LATE_}})\n  _LATE_: (y)\n"), ["EARLY"]);
});

test("a sequence counts captures in its entries", () => {
  assert.deepEqual(
    lint(
      '  WORDS: ["a", "b"]\n  _WORDS_: ["a", "b"]\n  GROUPED: ["(x)", "y"]\n  _GROUPED_: ["(x)"]\n  USES: (?:{{GROUPED}})\n',
    ),
    ["_WORDS_", "GROUPED", "USES"],
  );
});

test("undefined names and cycles neither throw nor count as captures", () => {
  assert.deepEqual(
    lint(
      "  U: (?:{{MISSING}})\n  P: (?:{{Q}})\n  Q: (?:{{P}})\n  _R_: (?:{{R2}})\n  R2: (?:{{_R_}})\n",
    ),
    ["_R_"],
  );
});

test("the underscore test matches the build's", () => {
  assert.deepEqual(lint("  __: (?:x)\n  _: (?:x)\n"), ["__", "_"]);
});
