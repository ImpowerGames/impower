import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";

const RULE = "lookaround-needs-rival-comment";

const ids = (source: string, baseline?: Record<string, number>) =>
  lintRule(source, RULE, baseline).map((m) => m.messageId);

const RIVAL = `Rival:
  match: x`;

test("an unjustified negative lookahead fails and a named rival passes", () => {
  const bare = grammar({
    repository: `${RIVAL}
Word:
  match: (?!x)\\w+`,
  });
  assert.deepEqual(ids(bare), ["missing"]);
  const justified = grammar({
    repository: `${RIVAL}
# Matches a word.
# lookaround: steps aside for Rival, which owns a leading x; Rival is
# included after Word in three Switches, so reordering cannot help.
Word:
  match: (?!x)\\w+`,
  });
  assert.deepEqual(ids(justified), []);
});

test("the comment must name an existing rule or variable other than the owner", () => {
  const unknown = grammar({
    repository: `# lookaround: steps aside for Missing.
Word:
  match: (?<=a)b`,
  });
  assert.deepEqual(ids(unknown), ["noRival"]);
  const self = grammar({
    repository: `# lookaround: Word needs it.
Word:
  match: (?<!a)b`,
  });
  assert.deepEqual(ids(self), ["noRival"]);
  const variable = grammar({
    variables: "WS: (?:[ ])",
    repository: `# lookaround: stops before {{WS}}.
Word:
  match: (?<!a)b`,
  });
  assert.deepEqual(ids(variable), []);
});

test("a comment separated by a blank line does not count", () => {
  const source = grammar({
    repository: `${RIVAL}
# lookaround: steps aside for Rival.

Word:
  match: (?!x)y`,
  });
  assert.deepEqual(ids(source), ["missing"]);
});

test("line-end and BEAT bail-outs pass; other positive lookaheads only in end:", () => {
  const source = grammar({
    variables: "BEAT: (?:^scene[ ])\nNL: (?:\\n)",
    repository: `Scoped:
  begin: a(?=$|{{BEAT}}|{{WS}}*$|{{NL}})
  end: (?=[)])|b
Ahead:
  match: a(?=b)`,
  });
  const messages = lintRule(source, RULE);
  assert.deepEqual(
    messages.map((m) => [m.messageId, m.line]),
    [["missing", 10]],
  );
  const end = grammar({
    repository: `Scoped:
  begin: a
  end: (?<!x)b`,
  });
  assert.deepEqual(ids(end), ["missing"]);
});

test("inline rules and variables are checked, with the comment above them", () => {
  const source = grammar({
    variables: `${"NAME: (?!end)\\w+"}`,
    repository: `${RIVAL}
Outer:
  patterns:
    # lookaround: steps aside for Rival.
    - match: (?!x)y
    - match: (?!x)z`,
  });
  const messages = lintRule(source, RULE);
  assert.deepEqual(
    messages.map((m) => [m.messageId, m.line]),
    [
      ["missing", 2],
      ["missing", 11],
    ],
  );
  assert.match(messages[1]!.message, /Outer \(inline rule\)\.match/);
});

test("block-scalar text that looks like a comment is not one", () => {
  const source = grammar({
    repository: `Rival:
  match: |-
    # lookaround: steps aside for Rival.
Word:
  match: (?!x)y`,
  });
  assert.deepEqual(ids(source), ["missing"]);
});

test("a comment above a `-` on its own line covers the inline rule", () => {
  const source = grammar({
    repository: `${RIVAL}
Outer:
  patterns:
    # lookaround: steps aside for Rival.
    -
      match: (?!x)y`,
  });
  assert.deepEqual(ids(source), []);
});

test("the innermost marked comment decides, not one above the owner", () => {
  const source = grammar({
    repository: `${RIVAL}
# lookaround: Missing.
Outer:
  patterns:
    # lookaround: steps aside for Rival.
    - match: (?!x)y
    - match: (?!x)z`,
  });
  assert.deepEqual(
    lintRule(source, RULE).map((m) => [m.messageId, m.line]),
    [["noRival", 10]],
  );
});

test("array variable entries are checked", () => {
  const source = grammar({
    variables: `WORDS: ["(?!end)word", "plain"]
# lookaround: steps aside for Rival.
JUSTIFIED: ["(?!end)word"]`,
    repository: RIVAL,
  });
  const messages = lintRule(source, RULE);
  assert.deepEqual(
    messages.map((m) => [m.messageId, m.line]),
    [["missing", 2]],
  );
  assert.match(messages[0]!.message, /variable WORDS \(array entry/);
});

test("the baseline allows its count per owner and reports all past it", () => {
  const one = grammar({ repository: "Word:\n  match: (?!x)y" });
  assert.deepEqual(ids(one, { "repository.Word": 1 }), []);
  const two = grammar({ repository: "Word:\n  match: (?!x)(?<=y)z" });
  const messages = lintRule(two, RULE, { "repository.Word": 1 });
  assert.equal(messages.length, 2);
  assert.match(
    messages[0]!.message,
    /2 findings in `repository.Word`; the baseline allows 1/,
  );
  assert.deepEqual(ids(two, { "repository.Other": 5 }), ["missing", "missing"]);
});
