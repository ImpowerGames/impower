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
