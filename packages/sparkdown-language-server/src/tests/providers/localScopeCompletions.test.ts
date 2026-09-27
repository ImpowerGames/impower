import { describe, expect, test } from "vitest";
import { labelsAt } from "./completionHarness";

// A Luau `local` or `const` is offered from the statement after its
// declaration to the end of the block it is declared in, and a function
// parameter inside its function's body. A `store` is global wherever it is
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

  test("a local const is scoped like a local", () => {
    const source =
      "function main()\n  const limit = 3\n  l@1\nend\nfunction other()\n  return l@2\nend\n";
    expect(labelsAt(source, { at: "1" })).toContain("limit");
    expect(labelsAt(source, { at: "2" })).not.toContain("limit");
  });

  test("a store written inside a function is offered in another function", () => {
    const labels = labelsAt(
      "function main()\n  store saved = 1\nend\nfunction other()\n  return s@1\nend\n",
    );
    expect(labels).toContain("saved");
  });

  test("a function expression's parameter is offered only in its body", () => {
    const source =
      "function main()\n  local f = function(arg)\n    return a@1\n  end\n  return a@2\nend\n";
    expect(labelsAt(source, { at: "1" })).toContain("arg");
    expect(labelsAt(source, { at: "2" })).not.toContain("arg");
  });
});
