import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRules } from "../utils/lint-fixture.ts";

const ids = (tag: string) =>
  lintRules(
    grammar({
      repository: `Leaf:
  name: keyword.sd
  tag: '${tag}'
  match: a`,
    }),
    { "sparkdown-grammar/parse-tag-valid": "error" },
  ).map((m) => m.messageId);

test("a tag parseTag reads passes", () => {
  assert.deepEqual(ids("keyword"), []);
  assert.deepEqual(ids("(Block_content/) keyword"), []);
  assert.deepEqual(ids('("Block/part_content"/) keyword'), []);
});

test("a parent path parseTag refuses is reported", () => {
  for (const tag of [
    "(Block_content...) keyword",
    "(Block_content//Leaf_content/) keyword",
    "(Block_content!/) keyword",
    '("Block"_content/) keyword',
  ]) {
    assert.deepEqual(ids(tag), ["invalidModifier"], tag);
  }
});

test("an unknown tag is still reported", () => {
  assert.deepEqual(ids("notATag"), ["invalidExpression"]);
});
