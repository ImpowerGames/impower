// LocalShadow (I-602): a used local in a function that hides an earlier local
// of the same function, or a global the whole program uses. The upstream
// cases are in `luau-conformance/LintCandidatesScope.test.ts`; these are the
// controls around them and the program-wide form.

import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { testCompiler } from "../engineUnderTest";
import { diagnoseDetailed, diagnoseFilesDetailed } from "../luau-conformance/diagnosticTestHarness";

const shadows = (source: string) => diagnoseDetailed(source).filter((d) => d.code === "LocalShadow");
const messages = (source: string) => shadows(source).map((d) => d.message);
const inFunction = (body: string) => messages(`function f(p)\n${body}\nend\n`);
const programShadows = (sources: Record<string, string>) =>
  diagnoseFilesDetailed(sources)
    .filter((d) => d.code === "LocalShadow")
    .map((d) => `${d.file}: ${d.message}`);
// Only main runs lines outside a scene, so another script's lines run in one,
// a line below where the script would otherwise write them.
const inScene = (body: string) => `scene uses\n${body.replace(/^(?=.)/gm, "  ")}end\n`;

describe("LocalShadow within a function", () => {
  test("warns on a used block local with the declaration's range", () => {
    expect(shadows("function f()\n local x = 1\n do\n  local x = 2\n  print(x)\n end\n return x\nend\n")).toEqual([
      {
        file: "main.sd",
        code: "LocalShadow",
        message: "Variable 'x' shadows previous declaration at line 2",
        severity: 2,
        range: { start: { line: 3, character: 8 }, end: { line: 3, character: 9 } },
      },
    ]);
  });

  test.each([
    ["an unread local", "local x = 1\nlocal x = 2"],
    ["a local only written", "local x = 1\nlocal x = 2\nx = 3"],
    ["a local of a nested function", "local x = 1\nlocal g = function() local x = 2; return x end\nreturn x, g()"],
    ["sibling blocks", "do local x = 1; print(x) end\ndo local x = 2; print(x) end"],
    ["a second local function", "local function g() end\nlocal function g() end\ng()"],
    ["a name twice in one statement", "local a, a = 1, 2\nprint(a)"],
    ["a builtin global", "local math = math\nreturn math.max(1, 2)"],
    ["a prelude global", "print(config)\nlocal function g() local config = 1; return config end\nreturn g()"],
    ["a global nobody uses", "local fresh = 1\nreturn fresh"],
    ["an underscore-prefixed local", "local _v = 1\nlocal _v = 2\nreturn _v"],
    ["an underscore-prefixed parameter", "local g = function(_v) local _v = 2; return _v end\nreturn g()"],
  ])("is silent for %s", (_label, body) => {
    expect(inFunction(body)).toEqual([]);
  });

  test.each([
    ["a compound write", "local x = 1\nlocal x = 2\nx += 1", "x", 2],
    ["a parameter", "local p = 2\nreturn p", "p", 1],
    ["a numeric loop variable", "local i = 0\nfor i = 1, 2 do print(i) end\nreturn i", "i", 2],
    ["a generic loop variable", "local k = 0\nfor k in pairs({}) do print(k) end\nreturn k", "k", 2],
    ["a function statement naming the local", "local g = 1\nlocal g = 2\nfunction g() end", "g", 2],
  ])("warns for %s", (_label, body, name, line) => {
    expect(inFunction(body)).toEqual([`Variable '${name}' shadows previous declaration at line ${line}`]);
  });

  // luau-analyze 0.721 reports exactly these two: a parameter or loop
  // variable hiding another is silent unless the hidden loop variable is
  // never used (Luau's DuplicateLocal exemption compares their absent
  // declaring statements).
  test("parameters and loop variables hide each other as in Luau", () => {
    expect(
      messages(`function f(p)
  for p = 1, 2 do print(p) end
  for i = 1, 2 do print(i); for i = 1, 2 do print(i) end end
  for k = 1, 2 do for k = 1, 2 do print(k) end end
  for _, v in pairs({}) do print(v); local v = 1; print(v) end
  local g = function(q) print(q) for q = 1, 2 do print(q) end end
  g()
end
`),
    ).toEqual(["Variable 'k' shadows previous declaration at line 4", "Variable 'v' shadows previous declaration at line 5"]);
  });

  test("an underscore-prefixed local hiding a used global is silent", () => {
    expect(messages("& _state = 1\nfunction f()\n local _state = 2\n return _state\nend\n")).toEqual([]);
  });

  test("a keyword the grammar reads in place of a name silences that name", () => {
    // `match(1)` is read as the start of a `match` block, not a call of the local.
    const source = (call: string) => `function f()\n local match = print\n local match = print\n print(match)${call}\nend\n`;
    expect(messages(source(""))).toEqual(["Variable 'match' shadows previous declaration at line 2"]);
    expect(messages(source("\n match(1)"))).toEqual([]);
  });
});

describe("LocalShadow of a global", () => {
  const subject = "function f()\n local state = 2\n return state\nend\n";

  test("a use in the same script keeps Luau's message", () => {
    expect(messages(`& state = 1\n${subject}`)).toEqual(["Variable 'state' shadows a global variable used at line 1"]);
  });

  test.each([
    ["a logic read", inScene("& print(state)\n"), 2],
    ["a logic write", inScene("& state = 1\n"), 2],
    ["a narrative interpolation", inScene("State: {state}.\n"), 2],
    ["a function's read", "function g()\n return state\nend\n", 2],
  ])("sees %s in another script", (_label, use, line) => {
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": subject, "use.sd": use })).toEqual([
      `subject.sd: Variable 'state' shadows a global variable used at line ${line} in 'use.sd'`,
    ]);
  });

  test("prefers the script's own first use", () => {
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": `${subject}${inScene("& print(state)\n& state = 1\n")}`, "a.sd": inScene("& print(state)\n") })).toEqual([
      "subject.sd: Variable 'state' shadows a global variable used at line 6",
    ]);
  });

  test("selects another script's use by URI and then offset", () => {
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": subject, "z.sd": inScene("& state = 1\n"), "a.sd": inScene("One.\n& print(state)\n& state = 3\n") })).toEqual([
      "subject.sd: Variable 'state' shadows a global variable used at line 3 in 'a.sd'",
    ]);
  });

  test("a constant with no use is not a use", () => {
    // The other script is read: a write there is a use, which warns.
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": subject, "use.sd": inScene("& state = 1\n") })).not.toEqual([]);
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": subject, "use.sd": "const state = 1\n" })).toEqual([]);
  });

  test("a local hiding another local is reported against that local only", () => {
    expect(messages("& state = 1\nfunction f()\n local state = 2\n local state = 3\n return state\nend\n")).toEqual([
      "Variable 'state' shadows previous declaration at line 3",
    ]);
  });

  test("a local declared outside every function anywhere in the program silences the name", () => {
    // The other script is read: a write there is a use, which warns.
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": subject, "use.sd": inScene("& state = 1\n") })).not.toEqual([]);
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": subject, "use.sd": inScene("& local state = 1\nState: {state}.\n") })).toEqual([]);
  });

  test.each([
    ["narrative only", "scene inspect(state)\n State: {state}.\nend\n"],
    ["Luau statements", "scene inspect(state)\n & print(state)\n State: {state}.\nend\n"],
  ])("an interpolation inside a scene with a parameter of the name is not a global use (%s)", (_label, scene) => {
    expect(messages(`${scene}${subject}`)).toEqual([]);
  });

  test("a local's own initializer is a global use", () => {
    const source = "function f()\n local state = state\n return state\nend\n";
    expect(messages(source)).toEqual(["Variable 'state' shadows a global variable used at line 2"]);
    expect(messages(`${source}& print(state)\n`)).toEqual(["Variable 'state' shadows a global variable used at line 2"]);
  });

  test.each([
    ["a scene parameter after the use", `${inScene("& state = 1\n")}scene inspect(state)\n State: {state}.\nend\n`, {}],
    ["a Sparkle handler's local", `${inScene("& state = 1\n")}layout main with\n button @click={ local state = 3; print(state) }\nend\n`, {}],
    ["another script's scene parameter", inScene("& state = 1\n"), { "flow.sd": "scene inspect(state)\n & print(state)\nend\n" }],
    // The reading declares a nested branch's parameters as a local of its scene.
    ["another script's nested branch parameter", inScene("& state = 1\n"), { "flow.sd": "scene inspect()\n branch inner(state)\n  State: {state}.\n end\nend\n" }],
  ])("%s does not hide a global use elsewhere", (_label, use, more) => {
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": subject, "use.sd": use, ...more })).toEqual([
      "subject.sd: Variable 'state' shadows a global variable used at line 2 in 'use.sd'",
    ]);
  });

  test("a published const is a global, not a local the function's local hides", () => {
    expect(messages("const state = 1\n& print(state)\nfunction f()\n  local state = 2\n  return state\nend\n")).toEqual(["Variable 'state' shadows a global variable used at line 2"]);
  });

  test("a handler local's own initializer is a global use", () => {
    expect(messages(`layout main with\n  button @click={ local state = state; print(state) }\nend\n${subject}`)).toEqual(["Variable 'state' shadows a global variable used at line 2"]);
  });

  test("a type in a scene's parameter list is not a parameter", () => {
    const source = (type: string) => `${subject}const state = 1\nscene inspect(value: ${type})\n  : {state}.\nend\n`;
    expect(messages(source("number"))).toEqual(["Variable 'state' shadows a global variable used at line 7"]);
    expect(messages(source("state"))).toEqual(["Variable 'state' shadows a global variable used at line 7"]);
  });

  test("a scene's parameter does not name the global after the scene's end", () => {
    expect(messages(`${subject}const state = 1\nscene inspect(state)\n  : {state}.\nend\n: {state}.\n`)).toEqual(["Variable 'state' shadows a global variable used at line 9"]);
  });

  test("an interpolation inside a function with a local of the name is not a global use", () => {
    expect(messages(`function g(state)\n return \`State: {state}.\`\nend\n${subject}`)).toEqual([]);
  });

  test("a name on a line with a syntax error is not a use", () => {
    const sources = (name: string, use: string) => ({ "main.sd": "Ready.\n", "subject.sd": `function f()\n local ${name} = 2\n return ${name}\nend\n`, "use.sd": inScene(use) });
    expect(programShadows(sources("i", "& i = 1\n"))).toEqual(["subject.sd: Variable 'i' shadows a global variable used at line 2 in 'use.sd'"]);
    // Luau's integer literal suffix, which the reading takes for a name.
    expect(programShadows(sources("i", "& v = 0x10i\n"))).toEqual([]);
    // Every name on that line, the write before the error included.
    expect(programShadows(sources("v", "& v = 0x10i\n"))).toEqual([]);
    expect(programShadows(sources("v", "& v = 0x10i\n& v = 1\n"))).toEqual(["subject.sd: Variable 'v' shadows a global variable used at line 3 in 'use.sd'"]);
  });

  test("a Sparkle handler is a use", () => {
    expect(programShadows({ "main.sd": "Ready.\n", "subject.sd": subject, "use.sd": "layout main with\n button @click={ print(state) }\nend\n" })).toEqual([
      "subject.sd: Variable 'state' shadows a global variable used at line 2 in 'use.sd'",
    ]);
  });

  test("a keyword the grammar reads in place of a global's name silences it", () => {
    const sources = (use: string) => ({ "main.sd": "Ready.\n", "subject.sd": "function f()\n local match = print\n return match\nend\n", "use.sd": inScene(use) });
    expect(programShadows(sources("& match = 1\n"))).toEqual(["subject.sd: Variable 'match' shadows a global variable used at line 2 in 'use.sd'"]);
    expect(programShadows(sources("& match = 1\n& local v = match(1) | a = 1 end\n"))).toEqual([]);
    // A structural word with no arms is a name (I-1310): its call is a use.
    expect(programShadows(sources("& match(1)\n"))).toEqual(["subject.sd: Variable 'match' shadows a global variable used at line 2 in 'use.sd'"]);
  });

  test("an unchanged script gains and loses its warning as another script changes or leaves", () => {
    const compiler = testCompiler();
    const file = (path: string, text: string) => ({ uri: `inmemory:///${path}`, type: "script" as const, name: path.replace(/\.sd$/, ""), ext: "sd", text, version: 1, languageId: "sparkdown" });
    compiler.configure({ files: [file("main.sd", "Ready.\n"), file("subject.sd", subject), file("use.sd", inScene("Nothing.\n"))] });
    const found = () => {
      const program: SparkProgram = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
      return (program.diagnostics?.["inmemory:///subject.sd"] ?? []).filter((d) => d.code === "LocalShadow").map((d) => (typeof d.message === "string" ? d.message : d.message.value));
    };
    const update = (path: string, text: string, version: number) => compiler.updateDocument({ textDocument: { uri: `inmemory:///${path}`, version }, contentChanges: [{ text }] });
    expect(found()).toEqual([]);
    const tree = compiler.documents.tree("inmemory:///subject.sd");
    update("use.sd", inScene("& state = 1\n"), 2);
    expect(found()).toEqual(["Variable 'state' shadows a global variable used at line 2 in 'use.sd'"]);
    update("use.sd", inScene("Nothing.\n"), 3);
    expect(found()).toEqual([]);
    update("use.sd", inScene("& state = 1\n"), 4);
    expect(found()).toHaveLength(1);
    compiler.removeFile({ file: { uri: "inmemory:///use.sd" } } as never);
    expect(found()).toEqual([]);
    expect(compiler.documents.tree("inmemory:///subject.sd")).toBe(tree);
  });
});
