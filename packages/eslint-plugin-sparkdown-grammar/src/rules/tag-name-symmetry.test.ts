import assert from "node:assert/strict";
import { test } from "node:test";
import { grammar, lintRule } from "../utils/lint-fixture.ts";

const ids = (source: string, baseline?: Record<string, number>) =>
  lintRule(source, "tag-name-symmetry", baseline).map((m) => m.messageId);

test("a rule with both passes; either one alone fails", () => {
  const source = grammar({
    repository: `Both:
  tag: keyword
  name: keyword.sd
  match: a
TagOnly:
  tag: keyword
  match: b
NameOnly:
  name: meta.region.sd
  begin: c
  end: $
  patterns:
    - name: keyword.inline.sd
      match: d`,
  });
  assert.deepEqual(ids(source), ["missingName", "missingTag", "missingTag"]);
});

test("baselined regions pass until another finding appears", () => {
  const source = grammar({
    repository: `NameOnly:
  name: meta.region.sd
  begin: c
  end: $`,
  });
  assert.deepEqual(ids(source, { "repository.NameOnly": 1 }), []);
});
