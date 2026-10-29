import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { dumpTree, parseSource, stripAnsi } from "./grammarSnapshot";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { diagnoseFilesDetailed } from "../luau-conformance/diagnosticTestHarness";

const URI = "inmemory:///main.sd";
const HEADER = "function run()\n  ";
const FOOTER = "\nend\n";
const STORY = "After {run()}.\n";

function compile(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [];
}

function sparkdownErrors(text: string): string[] {
  return compile(text)
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}


function expectOfficial(form: string, { reported = true, range = {} }: { reported?: boolean; range?: Record<string, string> } = {}): void {
  const luau = `${HEADER}${form}${FOOTER}`;
  const text = `${luau}${STORY}`;
  const tree = stripAnsi(dumpTree(text));
  expect(tree, tree).not.toContain("ERROR_INCOMPLETE");
  const fn = parseSource(text).topNode.firstChild!;
  expect([fn.name, fn.from, fn.to], "the function ends at its own `end`").toEqual(["LuauFunctionDefinition", 0, luau.length - 1]);
  const official = officialErrorList(luau).map((e) => {
    const message = e.slice(e.indexOf(" ") + 1);
    return range[message] ? `${range[message]} ${message}` : e;
  });
  expect(official.length > 0, `the official parser ${reported ? "reports" : "accepts"} the form`).toBe(reported);
  expect(sparkdownErrors(text)).toEqual(official.sort());
}

describe("every syntax error Luau reports inside a function is reported (I-1322)", () => {
  describe("table constructors and table types", () => {
    for (const form of [
      "local t = {nil=1}",
      "type T = {\n    [string] : number,\n    [number] : string,\n  }",
      "_[{nil=_,}](_)",
      'type S = "bar"\n  type T = {\n    [("foo")] : number,\n    [S] : string,\n  }',
    ]) {
      test(JSON.stringify(form), () => expectOfficial(form));
    }
  });

  describe("a function without a valid name", () => {
    for (const form of ["function +() local _ = true end", "local function () end\n  local function () end"]) {
      test(JSON.stringify(form), () => expectOfficial(form));
    }
  });

  describe("a missing comma between parameters", () => {
    for (const form of [
      "local function f(a: number b) end",
      "local function f(a --[[c]] b) end",
      "local function f(a: number --[[c]] b) end",
      "local function f(a --[[c]] b: number) end",
      "local function f(a --[[c]]\n   b) end",
    ]) {
      test(JSON.stringify(form), () => expectOfficial(form));
    }
    for (const form of [
      "local function f(a, b) return a, b end",
      "local function f(a: number, b: string) return a, b end",
      "local function f(a --[[c]], b) return a, b end",
      "local function f(a, ...) return a, ... end",
    ]) {
      test(`${JSON.stringify(form)} stays valid`, () => expectOfficial(form, { reported: false }));
    }
  });

  describe("a member access after a value no access path reads", () => {
    for (const form of ["local b = {}.x", 'local b = "s".x', "local b = {}[1]", 'local b = "s"[1]', 'local t = { "a" ["k"] = 1 }']) {
      test(JSON.stringify(form), () => expectOfficial(form));
    }
    for (const form of ["local b = (t).x\n  return b", 'local s = ("a"):upper()\n  return s', 'local s = "a" .. "b"\n  return s']) {
      test(`${JSON.stringify(form)} stays valid`, () => expectOfficial(form, { reported: false }));
    }
  });

  describe("nil before a colon", () => {
    for (const form of ["while nil:do end", "if nil:then end", "local b = nil:do", "for k in nil:then do end", "for k = nil:then do end"]) {
      test(JSON.stringify(form), () => expectOfficial(form));
    }
    for (const form of ["local b = nil::any\n  return b", "local b = nil :: any\n  return b"]) {
      test(`${JSON.stringify(form)} stays valid`, () => expectOfficial(form, { reported: false }));
    }
  });

  describe("an incomplete statement", () => {
    test(JSON.stringify("(::"), () => expectOfficial("(::", { range: { "Expected type, got 'end'": "1:5-2:0" } }));
    test(JSON.stringify("repeat\n  t."), () => expectOfficial("repeat\n  t."));
  });

  describe("a function whose `end` a block took", () => {
    for (const form of ["while true", "while true d", "for x in t", "if x then\n    y()\n      end\n  while true d"]) {
      test(JSON.stringify(form), () => expectOfficial(form));
    }
  });

  describe("a table element without its comma", () => {
    for (const form of [
      "local t = { a = 1 b = 2 }",
      "local t = { a = 1\n    b = 2 }",
      "local t = {\n    a = 1\n    b = 2\n  }",
      "local t = {\n    [1] = 2\n    [3] = 4\n  }",
      "local t = {\n    [1] = 2\n      [3] = 4\n  }",
    ]) {
      test(JSON.stringify(form), () => expectOfficial(form));
    }
  });

  describe("a method name on the next line", () => {
    for (const form of [
      "if flag:\nHello there.\n  then return 1 end",
      "flag:\nHello there.",
      "if flag:\n\nHello there.\n  then return 1 end",
      "if flag:\n  -- a note\nHello there.\n  then return 1 end",
      "if flag: -- a note\nHello there.\n  then return 1 end",
      "flag:\n  --[[note]] (1)",
      "flag:\n  --[[note]] 1",
      "if flag:\n  --[[note]] then return 1 end",
    ]) {
      test(JSON.stringify(form), () => expectOfficial(form));
    }
    for (const form of [
      "local t = {}\n  t:\n    m()",
      "local t = {}\n  local x = t:\n    m()\n  return x",
      "for k:\n    number in pairs({}) do end",
      "if flag:\n\n    Hello()\n  then return 1 end",
      "if flag: -- a note\n    Hello()\n  then return 1 end",
      "if flag:\n    --[[ a note ]]\n    Hello()\n  then return 1 end",
      "local t = {}\n  t: --[[ a note ]] m()",
    ]) {
      test(`${JSON.stringify(form)} stays valid`, () => expectOfficial(form, { reported: false }));
    }

    test("the control without the colon still plays", () => {
      const ctx = makeRuntimeStoryFromSource("function f(flag)\n  if flag\n  then return 1 end\nend\nBefore {f(true)}.\n");
      expect(ctx.errorMessages).toEqual([]);
      expect(ctx.story.ContinueMaximally()).toBe("Before 1.\n");
    });
  });
});

function errorsMatching(text: string, pattern: RegExp): string[] {
  return compile(text)
    .filter((d) => pattern.test(messageOf(d)))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`);
}

describe("an end at the script root that closes nothing is reported (I-774)", () => {
  const EOF = /^Expected <eof>, got 'end'$/;
  test.each([
    ["an extra end after a function", "Value {f(true)}.\nfunction f(c)\n  return 1\nend\n  return 2\nend\n", 5],
    ["a one-line if expression written as a statement", "Value {f(true)}.\nfunction f(c)\n  local g = if c then 2 else 3 end\n  return g\nend\n", 4],
    [
      "an indented if expression written as a statement",
      "Value {f(true)}.\nfunction f(c)\n  local a, g = 1,\n    if c then\n      2\n    else\n      3\n    end\n  return g\nend\n",
      9,
    ],
    [
      "an unindented if expression written as a statement",
      "Value {f(true)}.\nfunction f(c)\n  local a, g = 1,\nif c then\n  2\nelse\n  3\nend\n  return g\nend\n",
      9,
    ],
  ])("%s", (_name, text, line) => {
    expect(errorsMatching(text, EOF)).toEqual([`${line}:0-${line}:3 Expected <eof>, got 'end'`]);
  });

  test("the end of a scene or branch, and every nested end, are not", () => {
    const text = [
      "scene start",
      "  if true then",
      "    Hello.",
      "  end",
      "  branch side",
      "    while false do",
      "      Hi.",
      "    end",
      "  end",
      "end",
      "branch alone",
      "  Bye.",
      "end",
      "function f()",
      "  do end",
      "end",
      "",
    ].join("\n");
    expect(errorsMatching(text, /<eof>/)).toEqual([]);
  });

  test.each([
    ["1 + ;", "6:16-6:17 Expected identifier when parsing expression, got ';'"],
    ["?", "6:12-6:13 Expected identifier when parsing expression, got '?'"],
  ])("a function after a stray end keeps its own errors: %s", (value, error) => {
    const text = `function f()\n  do\n    until true\n  end\nend\nfunction g()\n  local x = ${value}\nend\n${STORY}`;
    expect(sparkdownErrors(text)).toContain(error);
  });

  test("a second function that stops has the errors it has alone", () => {
    const stops = (name: string) => `function ${name}()\n  do\n    until true\n  end\nend\n`;
    const both = sparkdownErrors(`${stops("f")}${stops("g")}${STORY}`);
    const alone = [...sparkdownErrors(`${stops("f")}${STORY}`), ...sparkdownErrors(`${"\n".repeat(5)}${stops("g")}${STORY}`)];
    expect(both).toEqual(alone.sort());
    expect(both.filter((e) => e.startsWith("7:") || e.startsWith("8:"))).toEqual(["7:4-7:9 Expected 'end' (to close 'do' at line 7), got 'until'"]);
  });
});

describe("text after a scene or branch header is reported on the header line (I-674)", () => {
  const scene = (header: string) => `Hi.\n${header}\n  Hello.\nend\n`;
  const branch = (header: string) => `scene start\n${header}\n    Hello.\n  end\nend\n`;
  const onHeaderLine = (source: string) =>
    compile(source)
      .filter((d) => d.range.start.line === 1)
      .map((d) => `${d.range.start.character}-${d.range.end.character} ${messageOf(d)}`);

  test.each([
    ["a word after a scene's parameters", scene("scene start(n: number) oops"), "23-27 Unexpected text after the scene's header: `oops`. Only tags (`# name`) and a `--` comment can follow a scene's name and parameters on its line."],
    ["a word after a scene's name", scene("scene start oops"), "12-16 Unexpected text after the scene's header: `oops`. Only tags (`# name`) and a `--` comment can follow a scene's name and parameters on its line."],
    ["a word after a branch's name", branch("  branch side oops"), "14-18 Unexpected text after the branch's header: `oops`. Only tags (`# name`) and a `--` comment can follow a branch's name and parameters on its line."],
    ["a word after a branch's parameters", branch("  branch side(k) oops"), "17-21 Unexpected text after the branch's header: `oops`. Only tags (`# name`) and a `--` comment can follow a branch's name and parameters on its line."],
    ["a word after a scene named `scene`", scene("scene scene oops"), "12-16 Unexpected text after the scene's header: `oops`. Only tags (`# name`) and a `--` comment can follow a scene's name and parameters on its line."],
    ["a word after a branch named `branch`", branch("  branch branch oops"), "16-20 Unexpected text after the branch's header: `oops`. Only tags (`# name`) and a `--` comment can follow a branch's name and parameters on its line."],
  ])("%s is reported", (_name, source, expected) => {
    expect(onHeaderLine(source)).toEqual([expected]);
  });

  test.each([
    ["a comment after a scene's parameters", scene("scene start(n: number) -- a note")],
    ["a comment after a scene's name", scene("scene start -- a note")],
    ["a comment after a branch's name", branch("  branch side -- a note")],
    ["a comment after a branch's parameters", branch("  branch side(k) --[[ a note ]]")],
    ["a header alone", scene("scene start(n: number)")],
    ["tags after a scene's name", scene("scene start # arc")],
    ["tags and a comment after a branch's parameters", branch("  branch side(k) # arc -- a note")],
    ["a scene named `scene`", scene("scene scene")],
    ["a branch named `branch`", branch("  branch branch")],
  ])("%s is not reported", (_name, source) => {
    expect(onHeaderLine(source)).toEqual([]);
  });
});

describe("a store declaration's value keeps Luau's first error", () => {
  const store = "store t = {1 ? 2}";
  test("a store in story", () => {
    expect(sparkdownErrors(`${store}\nscene start\n  Hello.\nend\n`)).toEqual(
      officialErrorList(store.replace("store", "local")).sort(),
    );
  });

  test("a store in a function", () => {
    const luau = (statement: string) => `function f()\n  ${statement}\n  return 0\nend\n`;
    expect(sparkdownErrors(luau(store))).toEqual(officialErrorList(luau(store.replace("store", "local"))).sort());
  });

  test("a function value a store leaves open", () => {
    const errors = sparkdownErrors("store f = function()\n  local x = 1\n");
    expect(errors).toEqual([expect.stringMatching(/^0:10-0:20 This function is missing its closing `end` keyword\./)]);
  });
});

describe("a syntax error's message names the document's lines", () => {
  test.each([
    ["a function after a comment and a blank line", "-- intro\n\nfunction f()\n  -- body comment\n  if x then\n    y()\n      end\n  while true d\nend\n"],
    ["a function after blank lines", "\n\nfunction f()\n  while true d\nend\n"],
    ["a string token that reads like a line reference", "\n\nfunction f()\n  local \"(to close 'function' at line 999)\" = 1\nend\n"],
  ])("%s", (_label, text) => {
    const errors = sparkdownErrors(`${text}${STORY}`);
    expect(errors.some((e) => / at line \d+/.test(e))).toBe(true);
    expect(errors).toEqual(officialErrorList(text).sort());
  });

  test("a type warning names the document's line too", () => {
    const text = "\n\nfunction f()\n  -- a note\n  type T = number\n  type T = string\nend\n";
    const messages = compile(`${text}${STORY}`).map(messageOf);
    expect(messages).toContain("Redefinition of type 'T', previously defined at line 5");
  });

  test("a string that reads like a line reference is left as written", () => {
    const text = '---\ntypecheck: strict\n---\n\nfunction f()\n  local x: "at line 999" = "other"\n  return x\nend\n';
    const messages = compile(`${text}${STORY}`).map(messageOf);
    expect(messages).toContain(`Expected this to be '"at line 999"', but got '"other"'`);
  });
});

describe("a .luau file's errors are the official parser's", () => {
  const errorsIn = (sources: Record<string, string>) =>
    diagnoseFilesDetailed(sources)
      .filter((d) => d.file === "snippet.luau" && d.severity === DiagnosticSeverity.Error)
      .map(({ range, message }) => `${range!.start.line}:${range!.start.character}-${range!.end.line}:${range!.end.character} ${message}`)
      .sort();
  for (const snippet of [
    "local flag = true\nif flag:\n  print(1)\nend\n",
    "local flag = true\nif flag:\nHello there.\nend\n",
    "local b = nil:do\n",
    "while true do\n  x()\n",
    "local t = {nil=1}\n",
    "end\nend\n",
    "function f()\n  do\n    until true\n  end\nend\n",
    "end\nscene start oops\nend\n",
    "scene start oops\n",
    "branch side oops\n",
    "local \"(to close 'function' at line 999)\" = 1\n",
    "function f(\"(to close 'function' at line 999)\") end\n",
  ]) {
    test(JSON.stringify(snippet), () => {
      const official = officialErrorList(snippet, { luauFile: true }).sort();
      expect(official.length).toBeGreaterThan(0);
      expect(errorsIn({ "snippet.luau": snippet }), "read on its own").toEqual(official);
      expect(errorsIn({ "main.sd": 'run "snippet"\n', "snippet.luau": snippet }), "through a `run`").toEqual(official);
    });
  }

  test("text after an end is Luau's statement, not story text", () => {
    const messages = diagnoseFilesDetailed({ "snippet.luau": "function f()\nend x\n" })
      .filter((d) => d.file === "snippet.luau")
      .map((d) => d.message);
    expect(messages).toContain("Incomplete statement: expected assignment or a function call");
    expect(messages.filter((m) => m.includes("read as a line of story text"))).toEqual([]);
  });
});
