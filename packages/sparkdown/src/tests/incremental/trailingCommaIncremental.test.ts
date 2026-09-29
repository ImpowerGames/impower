// A Luau declaration whose comma ends its line spans the next line, so an
// edit on either line must reparse to the same tree a from-scratch parse
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
