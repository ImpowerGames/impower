// A function written inside a scene, a branch or a choice body, or a block of
// one (a `local function`, a function value, a function passed as an
// argument) reads the locals of its flow declared above it, so no read of one
// is reported as an unknown name (I-1746). A top-level function, a define's
// method, a function in another scene and a read of a local declared below
// the function still read the global, and are reported. A `local function`
// in a flow is a closure (I-1674), so its unknown names are reported as a
// function value's are, as Luau's unknown globals.
import { describe, expect, it } from "vitest";
import { testCompiler } from "../engineUnderTest";

const URI = "inmemory:///main.sd";

const UNKNOWN = /Cannot find (variable|item or path) named|Unknown global/;

function compiler(text: string) {
  const c = testCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return c;
}

function unknownNames(program: any): string[] {
  return ((program.diagnostics?.[URI] ?? []) as any[])
    .map((d) => `${d.range.start.line + 1}: ${typeof d.message === "string" ? d.message : d.message?.value}`)
    .filter((message) => UNKNOWN.test(message));
}

const compile = (text: string) => unknownNames((compiler(text).compile({ textDocument: { uri: URI } } as never) as any).program);

describe("a function written in a flow reads the flow's locals declared above it (I-1746)", () => {
  it.each([
    [
      "a local function reading a local named like a library",
      "scene main\n  local table = { nogetn = function() return 1 end }\n  local function g()\n    return table.nogetn()\n  end\n  & g()\nend\n",
    ],
    [
      "a local function reading a local named like a builtin function",
      "scene main\n  local type = function() return 1 end\n  local function g()\n    return type()\n  end\n  & g()\nend\n",
    ],
    [
      "a function value",
      "scene main\n  local table = { nogetn = function() return 1 end }\n  local f = function()\n    return table.nogetn()\n  end\n  & f()\nend\n",
    ],
    ["a local function", "scene main\n  local foo = 5\n  local function g()\n    return foo\n  end\n  & g()\nend\n"],
    [
      "a function passed as an argument",
      "scene main\n  local table = { nogetn = function() return 1 end }\n  & pcall(function() return table.nogetn() end)\nend\n",
    ],
    [
      "a colon call on a local named like a library",
      "scene main\n  local table = { nogetn = function(self) return 1 end }\n  local function g()\n    return table:nogetn()\n  end\n  & g()\nend\n",
    ],
    ["a local function writing the local", "scene main\n  local foo = 5\n  local function g()\n    foo = foo + 1\n  end\n  & g()\nend\n"],
    [
      "a function nested in a local function",
      "scene main\n  local foo = 5\n  local function g()\n    local function h()\n      return foo\n    end\n    return h()\n  end\n  & g()\nend\n",
    ],
    [
      "a local function in a branch reading its scene's local",
      "scene main\n  local foo = 5\n  branch b\n    local function g()\n      return foo\n    end\n    & g()\n  end\nend\n",
    ],
    [
      "a local function in a choice body",
      "scene main\n  local foo = 5\n  choose\n    + choice\n      local function g()\n        return foo\n      end\n      & g()\n  end\nend\n",
    ],
    ["a local function in a `do` block", "scene main\n  local foo = 5\n  do\n    local function g() return foo end\n    & g()\n  end\nend\n"],
    ["a local function in an `if` block", "scene main\n  local foo = 5\n  if true then\n    local function g() return foo end\n    & g()\n  end\nend\n"],
    ["a local function reading a local of its block", "scene main\n  do\n    local bar = 1\n    local function g() return bar end\n    & g()\n  end\nend\n"],
    [
      "a function value in an `if` block reading a local named like a library",
      "scene main\n  local table = { nogetn = function() return 1 end }\n  if true then\n    & pcall(function() return table.nogetn() end)\n  end\nend\n",
    ],
  ])("%s", (_, source) => {
    expect(compile(source)).toEqual([]);
  });

  it.each([
    [
      "a local declared below the function",
      "scene main\n  local function g()\n    return foo\n  end\n  local foo = 5\n  & g()\nend\n",
      ["3: Unknown global 'foo'; consider assigning to it first"],
    ],
    [
      "a top-level function reading a scene's local",
      "scene main\n  local foo = 5\nend\nfunction h()\n  return foo\nend\n",
      ["5: Cannot find variable named `foo`"],
    ],
    [
      "a function in one scene reading another scene's local",
      "scene a\n  local foo = 5\nend\nscene main\n  local function g()\n    return foo\n  end\n  & g()\nend\n",
      ["6: Unknown global 'foo'; consider assigning to it first"],
    ],
    [
      "a name no local declares, read in a block",
      "scene main\n  do\n    local function g() return nope end\n    & g()\n  end\nend\n",
      ["3: Unknown global 'nope'; consider assigning to it first"],
    ],
    [
      "a local declared below the block",
      "scene main\n  do\n    local function g() return foo end\n    & g()\n  end\n  local foo = 5\nend\n",
      ["3: Unknown global 'foo'; consider assigning to it first"],
    ],
    [
      "another scene's local, read in a block",
      "scene a\n  local foo = 5\nend\nscene main\n  do\n    local function g() return foo end\n    & g()\n  end\nend\n",
      ["6: Unknown global 'foo'; consider assigning to it first"],
    ],
    [
      "a define's method reading a scene local named like a library",
      "scene main\n  local table = { nogetn = function() return 1 end }\n  define thing with\n    function get() return table.nogetn() end\n  end\nend\n",
      ["4: Cannot find variable named `table`"],
    ],
  ])("still reports %s", (_, source, expected) => {
    expect(compile(source)).toEqual(expected);
  });

  it.each([
    ["a function in a branch", "scene main\n  local bar = 5\n  Hello.\n  branch b\n    local function g()\n      return foo\n    end\n    & g()\n  end\nend\n"],
    ["a block in a branch holding the function", "scene main\n  local bar = 5\n  Hello.\n  branch b\n    do\n      local function g() return foo end\n      & g()\n    end\n  end\nend\n"],
  ])("follows an edit that adds or removes the scene's local above %s", (_, text) => {
    // Edits by range, after an edit elsewhere has warmed the compiler, so
    // the branch's lines are reused unless what they read changed.
    const storyLine = 2;
    const c = compiler(text);
    let version = 1;
    const edit = (line: number, from: number, to: number, replacement: string) => {
      c.updateDocument({
        textDocument: { uri: URI, version: ++version },
        contentChanges: [{ range: { start: { line, character: from }, end: { line, character: to } }, text: replacement }],
      } as never);
      return unknownNames((c.compile({ textDocument: { uri: URI } } as never) as any).program);
    };
    const missing = ["6: Unknown global 'foo'; consider assigning to it first"];
    expect(unknownNames((c.compile({ textDocument: { uri: URI } } as never) as any).program)).toEqual(missing);
    expect(edit(storyLine, 7, 8, "!")).toEqual(missing);
    expect(edit(1, 8, 11, "foo")).toEqual([]);
    expect(edit(1, 8, 11, "bar")).toEqual(missing);
  });
});
