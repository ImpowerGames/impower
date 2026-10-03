import { describe, expect, test } from "vitest";
import { testCompiler } from "../engineUnderTest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

const URI = "inmemory:///return.sd";
function diagnostics(text: string) {
  const compiler = testCompiler();
  compiler.configure({ files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }] });
  return Object.values(compiler.compile({ textDocument: { uri: URI } }).program.diagnostics ?? {}).flat();
}
const messageOf = (d: { message: unknown }) => typeof d.message === "string" ? d.message : String((d.message as { value?: string })?.value);
const returns = ["return", "return 5", "return 1, 2", "& return", "& return 5", "& return 1, 2"];

describe("returns require a function body", () => {
  for (const ret of returns) {
    test.each([
      ["file", `Before.\n${ret}\nAfter.\n`, 1, 0],
      ["scene", `-> a\nscene a\n  Before.\n  ${ret}\n  After.\nend\n`, 3, 2],
      ["branch", `-> a.b\nscene a\nbranch b\n  Before.\n  ${ret}\n  After.\nend\nend\n`, 4, 2],
      ["file EOF", ret, 0, 0],
      ["scene last statement", `-> a\nscene a\n  ${ret}\nend\n`, 2, 2],
      ["scene conditional", `-> a\nscene a\n  if true then\n    ${ret}\n  end\nend\n`, 3, 4],
      ["scene loop", `-> a\nscene a\n  while true do\n    ${ret}\n  end\nend\n`, 3, 4],
    ] as const)(`${ret} at %s reports its written range`, (_scope, source, line, column) => {
      const ds = diagnostics(source);
      const misplaced = ds.filter((d) => /Return statements can only/.test(messageOf(d)));
      expect(misplaced.map(messageOf)).toHaveLength(1);
      expect(ds.filter((d) => d.severity === 1 && !misplaced.includes(d)).map(messageOf)).toEqual([]);
      const expected = _scope.startsWith("file")
        ? "Return statements can only be used inside a function body — found one at file scope."
        : `Return statements can only be used inside a function body — found one in ${_scope === "branch" ? "branch 'b'" : "scene 'a'"}.`;
      expect(messageOf(misplaced[0]!)).toBe(expected);
      const start = column + (ret.startsWith("& ") ? 2 : 0);
      expect(misplaced[0]!.range).toEqual({ start: { line, character: start }, end: { line, character: column + ret.length } });
    });
  }
});

describe("valid return control", () => {
  test("multiple values and bare returns retain their function behavior", () => {
    const ctx = makeRuntimeStoryFromSource("Value {f()}.\nfunction f()\n  local function empty() return end\n  empty()\n  local a, b = pair()\n  return a + b\nend\nfunction pair()\n  return 2, 3\nend\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });
  test.each([
    ["single", "return 5", "Value 5.\n"],
    ["conditional", "if true then\n    return 5\n  end\n  return 6", "Value 5.\n"],
    ["loop", "while true do\n    return 5\n  end\n  return 6", "Value 5.\n"],
  ])("%s function return still runs", (_name, body, output) => {
    const ctx = makeRuntimeStoryFromSource(`Value {f()}.\nfunction f()\n  ${body}\nend\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(output);
  });
  for (const [name, declaration] of [
    ["local", "local function f() return 5 end"],
    ["anonymous", "local f = function() return 5 end"],
    ["multiple", "local function f() return 5, 6 end"],
  ]) {
    test.each([
      ["file", `& ${declaration}\nValue {f()}.\ndone\n`],
      ["scene", `-> a\nscene a\n  & ${declaration}\n  Value {f()}.\n  done\nend\n`],
      ["branch", `-> a.b\nscene a\nbranch b\n  & ${declaration}\n  Value {f()}.\n  done\nend\nend\n`],
    ])(`a ${name} function in %s is permitted`, (_scope, source) => {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
    });
  }
  test("a scene tunnel returns control to its caller", () => {
    const ctx = makeRuntimeStoryFromSource("-> a\nscene a\n  Before.\n  -> b ->\n  After.\n  done\nend\nscene b\n  During.\n  ->->\nend\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nDuring.\nAfter.\n");
  });
  test("a branch tunnel returns control to its caller", () => {
    const ctx = makeRuntimeStoryFromSource("-> a\nscene a\n  Before.\n  -> b ->\n  After.\n  done\nbranch b\n  During.\n  ->->\nend\nend\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nDuring.\nAfter.\n");
  });
});
