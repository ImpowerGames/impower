import { describe, expect, test } from "vitest";
import { labelsAt } from "./completionHarness";

// A Luau `local` is offered from the statement after its declaration to the
// end of the block it is declared in, and a function or method parameter
// inside its function's body. A `local` in a scene's body is offered after
// it within that scene. A `store` or `const` is global wherever it is
// written. The upstream cases in autocompleteScope.test.ts cover function
// bodies; these cover the other blocks and the declarations that stay global.

describe("completion · Luau local scope", () => {
  test("a local in an if branch is offered later in that branch and not in the next branch or after the if", () => {
    const source = [
      "function main()",
      "  if true then",
      "    local thenLocal = 1",
      "    t@1",
      "  elseif false then",
      "    t@2",
      "  else",
      "    t@3",
      "  end",
      "  t@4",
      "end",
      "",
    ].join("\n");
    expect(labelsAt(source, { at: "1" })).toContain("thenLocal");
    for (const at of ["2", "3", "4"]) {
      expect(labelsAt(source, { at })).not.toContain("thenLocal");
    }
  });

  test("a local in a do block or loop body is not offered after its end", () => {
    for (const block of ["do", "while true do", "for i = 1, 3 do"]) {
      const source = `function main()\n  ${block}\n    local inner = 1\n    i@1\n  end\n  i@2\nend\n`;
      expect(labelsAt(source, { at: "1" }), block).toContain("inner");
      expect(labelsAt(source, { at: "2" }), block).not.toContain("inner");
    }
  });

  test("a local in a repeat loop is offered in its until condition", () => {
    const labels = labelsAt(
      "function main()\n  repeat\n    local done = true\n  until d@1\nend\n",
    );
    expect(labels).toContain("done");
  });

  test("a local is offered in a statement that follows its declaration on the same line", () => {
    expect(
      labelsAt("function main()\n  local foo = 1 return f@1\nend\n"),
    ).toContain("foo");
    const chained = labelsAt("function main()\n  local a1 = 1 local a2 = a@1\nend\n");
    expect(chained).toContain("a1");
    expect(chained).not.toContain("a2");
  });

  test("a store or const written inside a function is offered in another function", () => {
    const source =
      "function main()\n  store saved = 1\n  const limit = 3\nend\nfunction other()\n  return s@1\nend\nfunction third()\n  return l@2\nend\n";
    expect(labelsAt(source, { at: "1" })).toContain("saved");
    expect(labelsAt(source, { at: "2" })).toContain("limit");
  });

  test("a define method's local and parameter are offered only in the method", () => {
    const source = [
      "define Bird with",
      "  sing(tune)",
      "    local volume = 1",
      "    return t@1",
      "  end",
      "end",
      "",
      "function other()",
      "  return t@2",
      "end",
      "",
    ].join("\n");
    expect(labelsAt(source, { at: "1" })).toEqual(
      expect.arrayContaining(["tune", "volume"]),
    );
    const other = labelsAt(source, { at: "2" });
    expect(other).not.toContain("tune");
    expect(other).not.toContain("volume");
  });

  test("a local in a scene's body is offered after its declaration in that scene only", () => {
    const source = [
      "scene first",
      "  {m@1}",
      "  local mood = 1",
      "  {m@2}",
      "end",
      "",
      "scene second",
      "  {m@3}",
      "end",
      "",
    ].join("\n");
    expect(labelsAt(source, { at: "1" })).not.toContain("mood");
    expect(labelsAt(source, { at: "2" })).toContain("mood");
    expect(labelsAt(source, { at: "3" })).not.toContain("mood");
  });

  test("a function expression's parameter is offered only in its body", () => {
    const source =
      "function main()\n  local f = function(arg)\n    return a@1\n  end\n  return a@2\nend\n";
    expect(labelsAt(source, { at: "1" })).toContain("arg");
    expect(labelsAt(source, { at: "2" })).not.toContain("arg");
  });
});
