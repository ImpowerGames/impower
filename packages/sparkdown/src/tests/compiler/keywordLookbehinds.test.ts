// #1279: rules that read the name right after a keyword their parent's begin
// took keep a lookbehind on that keyword. textmate-grammar-tree has no `\G`,
// and the parent tries its patterns again after the header, so without the
// lookbehind a word that a comment leaves on the header's line is read as a
// second name. These inputs are unfinished headers; the tests count the name
// nodes so the expectation (one name) is stated directly rather than left to
// a reader of a whole tree snapshot.

import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

function count(source: string, node: string): number {
  const tree = stripAnsi(dumpTree(source));
  return tree.split("\n").filter((line) => line.includes(`─ ${node} `)).length;
}

describe("a keyword-led name is read only after its keyword", () => {
  test("a type function without parameters reads one name", () => {
    const source = `function outer()
  type function T --[[ c ]] q
  end
end
`;
    expect(count(source, "LuauTypeFunctionName")).toBe(1);
  });

  test("an external declaration reads one name", () => {
    const source = `external message(text) --[[ c ]] more
`;
    expect(count(source, "LuauFunctionDeclarationName")).toBe(1);
  });
});
