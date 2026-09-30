// A Luau declaration or reassignment whose comma ends its line spans the
// next line, so an edit on either line must reparse to the same tree a from-scratch parse
// gives: typing or deleting the comma, the value line or the comment between
// them, as an author does while writing the list.

import { describe, expect, test } from "vitest";
import { editAndReparse, type Edit, replaceEdit } from "./incremental";

const SOURCE = `function f(ok)
  local a, g = 1, -- note
    2
  if ok then
    local b, c = 3,

      4
  end
  repeat
    local d = 5
  until true
  return a + g
end
store hp = 100
The hero has {hp} health.
`;

const deleteLineEdit = (src: string, find: string): Edit => {
  const at = src.indexOf(find);
  if (at < 0) throw new Error(`deleteLineEdit: ${JSON.stringify(find)} not found`);
  const lineStart = src.lastIndexOf("\n", at) + 1;
  const lineEnd = src.indexOf("\n", at) + 1;
  return { from: lineStart, to: lineEnd, insert: "" };
};

const CASES: [string, (src: string) => Edit][] = [
  ["delete the continued value", (s) => deleteLineEdit(s, "    2\n")],
  ["edit the continued value", (s) => replaceEdit(s, "    2\n", "    2 + 3\n")],
  ["delete the comma", (s) => replaceEdit(s, "1, -- note", "1 -- note")],
  ["delete the comment", (s) => replaceEdit(s, "1, -- note", "1,")],
  ["delete the value after a blank line", (s) => deleteLineEdit(s, "      4\n")],
  ["add a comma before `until`", (s) => replaceEdit(s, "local d = 5", "local d = 5,")],
  ["add a comma before prose", (s) => replaceEdit(s, "store hp = 100", "store hp = 100,")],
  ["type a value after a new comma", (s) => replaceEdit(s, "local d = 5\n", "local d, e = 5,\n    6\n")],
];

describe("incremental reparse of a declaration continued after a trailing comma", () => {
  test.each(CASES)("%s", (_name, edit) => {
    const r = editAndReparse(SOURCE, edit(SOURCE));
    expect(r.identical, r.diff).toBe(true);
  });
});

// The same for a reassignment (#1147), which spans the next line the same
// way in Luau code and ends at its line in a narrative body.
const REASSIGNMENT_SOURCE = `function f(ok)
  local a, g = 0, 0
  a, g = 1, -- note
    2
  if ok then
    a, g = 3,

      4
  else
    a = 5
  end
  repeat
    g = 6
  until true
  return a + g
end
store hp, mp = 100, 50
-> one
scene one
  hp, mp = 90, 40
  The hero has {hp} health.
end
`;

const REASSIGNMENT_CASES: [string, (src: string) => Edit][] = [
  ["delete the continued value", (s) => deleteLineEdit(s, "    2\n")],
  ["edit the continued value", (s) => replaceEdit(s, "    2\n", "    2 + 3\n")],
  ["delete the comma", (s) => replaceEdit(s, "1, -- note", "1 -- note")],
  ["delete the comment", (s) => replaceEdit(s, "1, -- note", "1,")],
  ["delete the value after a blank line", (s) => deleteLineEdit(s, "      4\n")],
  ["add a comma before `else`", (s) => replaceEdit(s, "    a = 5\n", "    a, g = 5,\n")],
  ["add a comma before `until`", (s) => replaceEdit(s, "g = 6", "a, g = 6,")],
  ["add a comma before prose", (s) => replaceEdit(s, "hp, mp = 90, 40", "hp, mp = 90,")],
  ["type a value after a new comma", (s) => replaceEdit(s, "    g = 6\n", "    a, g = 6,\n      7\n")],
];

describe("incremental reparse of a reassignment continued after a trailing comma", () => {
  test.each(REASSIGNMENT_CASES)("%s", (_name, edit) => {
    const r = editAndReparse(REASSIGNMENT_SOURCE, edit(REASSIGNMENT_SOURCE));
    expect(r.identical, r.diff).toBe(true);
  });
});
