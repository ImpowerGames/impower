// A function written inside a scene, a branch or a choice body (a `local
// function`, a function value, a function passed as an argument) reads the
// locals of its flow declared above it, so no read of one is reported as an
// unknown name (I-1746). A top-level function, a function in another scene
// and a read of a local declared below the function still read the global,
// and are reported.
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
      ["3: Cannot find variable named `foo`"],
    ],
    [
      "a top-level function reading a scene's local",
      "scene main\n  local foo = 5\nend\nfunction h()\n  return foo\nend\n",
      ["5: Cannot find variable named `foo`"],
    ],
    [
      "a function in one scene reading another scene's local",
      "scene a\n  local foo = 5\nend\nscene main\n  local function g()\n    return foo\n  end\n  & g()\nend\n",
      ["6: Cannot find variable named `foo`"],
    ],
    [
      "a name no local declares, read in a block",
      "scene main\n  do\n    local function g() return nope end\n    & g()\n  end\nend\n",
      ["3: Cannot find variable named `nope`"],
    ],
    [
      "a local declared below the block",
      "scene main\n  do\n    local function g() return foo end\n    & g()\n  end\n  local foo = 5\nend\n",
      ["3: Cannot find variable named `foo`"],
    ],
    [
      "another scene's local, read in a block",
      "scene a\n  local foo = 5\nend\nscene main\n  do\n    local function g() return foo end\n    & g()\n  end\nend\n",
      ["6: Cannot find variable named `foo`"],
    ],
  ])("still reports %s", (_, source, expected) => {
    expect(compile(source)).toEqual(expected);
  });

  it.each([
    ["the function", "scene main\n  local foo = 5\n  local function g()\n    return foo\n  end\n  & g()\nend\n", "4: Cannot find variable named `foo`"],
    ["a block holding the function", "scene main\n  local foo = 5\n  do\n    local function g() return foo end\n    & g()\n  end\nend\n", "4: Cannot find variable named `foo`"],
  ])("reports the read again once an edit removes the local above %s", (_, withLocal, expected) => {
    const c = compiler(withLocal);
    expect(unknownNames((c.compile({ textDocument: { uri: URI } } as never) as any).program)).toEqual([]);
    c.updateDocument({ textDocument: { uri: URI, version: 2 }, contentChanges: [{ text: withLocal.replace("local foo = 5", "local bar = 5") }] } as never);
    expect(unknownNames((c.compile({ textDocument: { uri: URI } } as never) as any).program)).toEqual([expected]);
    c.updateDocument({ textDocument: { uri: URI, version: 3 }, contentChanges: [{ text: withLocal }] } as never);
    expect(unknownNames((c.compile({ textDocument: { uri: URI } } as never) as any).program)).toEqual([]);
  });
});
