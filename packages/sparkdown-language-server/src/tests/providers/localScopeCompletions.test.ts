import { describe, expect, test } from "vitest";
import { labelsAt } from "./completionHarness";

// A Luau `local` is offered from the statement after its declaration to the
// end of the block it is declared in, whether the block is written in a
// function, in a scene's body or at the top of a script, and a function or
// method parameter inside its function's body. A `local` written directly in
// a scene's body is offered after it within that scene. A `store` or `const`
// is global wherever it is written. The upstream cases in
// autocompleteScope.test.ts cover function bodies; these cover the other
// blocks and the declarations that stay global.

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

  test("a local with no initializer is offered in a statement that follows it on the same line", () => {
    expect(labelsAt("function main()\n  local foo return f@1\nend\n")).toContain("foo");
    expect(
      labelsAt("function main()\n  local foo if f@1 then end\nend\n"),
    ).toContain("foo");
  });

  test("a local in a block written at the top of a script or in a scene is not offered after the block", () => {
    for (const [open, close] of [
      ["do", "end"],
      ["if true then", "end"],
      ["for i = 1, 3 do", "end"],
      ["while true do", "end"],
      ["repeat", "until true"],
    ]) {
      const top = `${open}\n  local inner = 1\n  {i@1}\n${close}\n{i@2}\n`;
      expect(labelsAt(top, { at: "1" }), `top: ${open}`).toContain("inner");
      expect(labelsAt(top, { at: "2" }), `top: ${open}`).not.toContain("inner");
      const scene = `scene one\n  ${open}\n    local inner = 1\n    {i@1}\n  ${close}\n  {i@2}\nend\n`;
      expect(labelsAt(scene, { at: "1" }), `scene: ${open}`).toContain("inner");
      expect(labelsAt(scene, { at: "2" }), `scene: ${open}`).not.toContain("inner");
    }
  });

  test("a local in a narrative if branch is not offered in the next branch, and a repeat's is offered in its until", () => {
    const source = [
      "scene one",
      "  if true then",
      "    local thenLocal = 1",
      "  elseif false then",
      "    {t@1}",
      "  else",
      "    {t@2}",
      "  end",
      "  repeat",
      "    local done = true",
      "  until d@3",
      "end",
      "",
    ].join("\n");
    expect(labelsAt(source, { at: "1" })).not.toContain("thenLocal");
    expect(labelsAt(source, { at: "2" })).not.toContain("thenLocal");
    expect(labelsAt(source, { at: "3" })).toContain("done");
  });

  test("a local in a Sparkle handler closure is not offered outside it", () => {
    const labels = labelsAt(
      'layout main with\n  button "x" @click={ local inner = 1 }\nend\nfunction after()\n  return i@1\nend\n',
    );
    expect(labels).not.toContain("inner");
  });

  test("a local in a scene's body is offered in the scene's later branches and body", () => {
    const source = [
      "scene play",
      "  branch one",
      "    Hello.",
      "  end",
      "  local mid = 1",
      "  branch two",
      "    {m@1}",
      "  end",
      "  {m@2}",
      "end",
      "",
      "scene other",
      "  {m@3}",
      "end",
      "",
    ].join("\n");
    expect(labelsAt(source, { at: "1" })).toContain("mid");
    expect(labelsAt(source, { at: "2" })).toContain("mid");
    expect(labelsAt(source, { at: "3" })).not.toContain("mid");
  });

  test("a local in a branch's body is offered only in that branch", () => {
    const source = [
      "scene play",
      "  branch one",
      "    local inBranch = 1",
      "    {i@1}",
      "  end",
      "  branch two",
      "    {i@2}",
      "  end",
      "  {i@3}",
      "end",
      "",
    ].join("\n");
    expect(labelsAt(source, { at: "1" })).toContain("inBranch");
    expect(labelsAt(source, { at: "2" })).not.toContain("inBranch");
    expect(labelsAt(source, { at: "3" })).not.toContain("inBranch");
  });

  test("a local in a scene's body is not offered after the scene's end", () => {
    const source = [
      "scene one",
      "  local mood = 1",
      "end",
      "function after()",
      "  return m@1",
      "end",
      "define D with",
      "  meth()",
      "    return m@2",
      "  end",
      "end",
      "{m@3}",
      "",
    ].join("\n");
    for (const at of ["1", "2", "3"]) {
      expect(labelsAt(source, { at }), `@${at}`).not.toContain("mood");
    }
  });

  test("a local at the top of a script is offered in the scenes and code below it", () => {
    const source = "local topLocal = 1\nscene s1\n  {t@1}\nend\n{t@2}\n";
    expect(labelsAt(source, { at: "1" })).toContain("topLocal");
    expect(labelsAt(source, { at: "2" })).toContain("topLocal");
  });

  test("a scene's local is not offered in a scene whose name it prefixes", () => {
    const labels = labelsAt(
      "scene intro\n  local mood = 1\nend\n\nscene introduction\n  {m@1}\nend\n",
    );
    expect(labels).not.toContain("mood");
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
