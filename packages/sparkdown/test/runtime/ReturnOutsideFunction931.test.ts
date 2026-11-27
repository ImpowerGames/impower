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

describe("story text and explicitly marked returns", () => {
  for (const ret of returns) {
    test.each([
      ["scene", `scene start\n  Before.\n  ${ret}\n  After.\nend\n`, 2, 2],
      ["branch", `scene start\n  -> b\nbranch b\n  Before.\n  ${ret}\n  After.\nend\nend\n`, 4, 2],
      ["scene last statement", `scene start\n  ${ret}\nend\n`, 1, 2],
      ["scene conditional", `scene start\n  if true then\n    ${ret}\n  end\nend\n`, 2, 4],
      ["scene loop", `scene start\n  while true do\n    ${ret}\n  end\nend\n`, 2, 4],
    ] as const)(`${ret} at %s follows its story or code context`, (_scope, source, line, column) => {
      const ds = diagnostics(source);
      const misplaced = ds.filter((d) => /Return statements can only/.test(messageOf(d)));
      if (!ret.startsWith("& ")) {
        expect(misplaced.map(messageOf)).toEqual([]);
        expect(ds.filter((d) => d.severity === 1).map(messageOf)).toEqual([]);
        if (_scope !== "scene loop") {
          const ctx = makeRuntimeStoryFromSource(source);
          expect(ctx.errorMessages).toEqual([]);
          expect(ctx.story.ContinueMaximally()).toContain(`${ret}\n`);
        }
        return;
      }
      expect(misplaced.map(messageOf)).toHaveLength(1);
      expect(ds.filter((d) => d.severity === 1 && !misplaced.includes(d)).map(messageOf)).toEqual([]);
      const expected = `Return statements can only be used inside a function body — found one in ${_scope === "branch" ? "branch 'b'" : "scene 'start'"}.`;
      expect(messageOf(misplaced[0]!)).toBe(expected);
      const start = column + (ret.startsWith("& ") ? 2 : 0);
      expect(misplaced[0]!.range).toEqual({ start: { line, character: start }, end: { line, character: column + ret.length } });
    });
  }
});

describe("returns at the top level of a script", () => {
  for (const ret of returns) {
    test.each([
      ["file", `Before.\n${ret}\nAfter.\nscene start\nend\n`, [0, 1, 2]],
      ["file EOF", `scene start\nend\n${ret}`, [2]],
    ] as const)(`${ret} at %s is a statement outside any scene`, (_scope, source, lines) => {
      const ds = diagnostics(source);
      expect(ds.map((d) => [messageOf(d), d.range.start.line])).toEqual(
        lines.map((line) => ["statement must be inside a scene or branch; the top level holds declarations only", line]),
      );
    });
  }
});

describe("valid return control", () => {
  test("multiple values and bare returns retain their function behavior", () => {
    const ctx = makeRuntimeStoryFromSource("scene start\n  Value {f()}.\nend\nfunction f()\n  local function empty() return end\n  empty()\n  local a, b = pair()\n  return a + b\nend\nfunction pair()\n  return 2, 3\nend\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
  });
  test.each([
    ["single", "return 5", "Value 5.\n"],
    ["conditional", "if true then\n    return 5\n  end\n  return 6", "Value 5.\n"],
    ["loop", "while true do\n    return 5\n  end\n  return 6", "Value 5.\n"],
  ])("%s function return still runs", (_name, body, output) => {
    const ctx = makeRuntimeStoryFromSource(`scene start\n  Value {f()}.\nend\nfunction f()\n  ${body}\nend\n`);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(output);
  });
  for (const [name, declaration] of [
    ["local", "local function f() return 5 end"],
    ["anonymous", "local f = function() return 5 end"],
    ["multiple", "local function f() return 5, 6 end"],
  ]) {
    test.each([
      ["function", `scene start\n  Value {g()}.\nend\nfunction g()\n  ${declaration}\n  return f()\nend\n`],
      ["scene", `scene start\n  & ${declaration}\n  Value {f()}.\n  done\nend\n`],
      ["branch", `scene start\n  -> b\nbranch b\n  & ${declaration}\n  Value {f()}.\n  done\nend\nend\n`],
    ])(`a ${name} function in %s is permitted`, (_scope, source) => {
      const ctx = makeRuntimeStoryFromSource(source);
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.ContinueMaximally()).toBe("Value 5.\n");
    });
  }
  test("a scene tunnel returns control to its caller", () => {
    const ctx = makeRuntimeStoryFromSource("scene start\n  Before.\n  -> b ->\n  After.\n  done\nend\nscene b\n  During.\n  ->->\nend\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nDuring.\nAfter.\n");
  });
  test("a branch tunnel returns control to its caller", () => {
    const ctx = makeRuntimeStoryFromSource("scene start\n  Before.\n  -> b ->\n  After.\n  done\nbranch b\n  During.\n  ->->\nend\nend\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("Before.\nDuring.\nAfter.\n");
  });
});
