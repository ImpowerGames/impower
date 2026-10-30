import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { testCompiler } from "../engineUnderTest";
import { diagnoseDetailed, diagnoseFilesDetailed } from "../luau-conformance/diagnosticTestHarness";

const unused = (source: string) => diagnoseDetailed(source).filter((d) => d.code === "FunctionUnused");
const messages = (source: string) => unused(source).map((d) => d.message);
const programUnused = (sources: Record<string, string>) =>
  diagnoseFilesDetailed(sources)
    .filter((d) => d.code === "FunctionUnused")
    .map((d) => `${d.file}: ${d.message}`);
const message = (name: string) => `Function '${name}' is never used; prefix with '_' to silence`;
const expectSubjectWarnsAlone = () =>
  expect(programUnused({ "main.sd": "Ready.\n", "subject.sd": "function helper()\nend\n" })).toEqual([`subject.sd: ${message("helper")}`]);
const inScene = (body: string) => `scene uses\n${body.replace(/^(?=.)/gm, "  ")}end\n`;

describe("FunctionUnused for a local function", () => {
  test("warns on the function's name", () => {
    expect(unused("& run()\nfunction run()\n local function helper() end\nend\n")).toEqual([
      {
        file: "main.sd",
        code: "FunctionUnused",
        message: message("helper"),
        severity: 2,
        range: { start: { line: 2, character: 16 }, end: { line: 2, character: 22 } },
      },
    ]);
  });

  test.each([
    ["a call", "local function helper() end\nhelper()"],
    ["a read as a value", "local function helper() end\nreturn helper"],
    ["a recursive call", "local function helper(n) if n > 0 then helper(n - 1) end end"],
    ["a call from a nested function", "local function helper() end\nlocal g = function() helper() end\ng()"],
    ["an underscore-prefixed name", "local function _helper() end"],
    ["a keyword the grammar reads in place of the name", "local function match() end\nmatch(1)"],
  ])("is silent for %s", (_label, body) => {
    expect(messages(`& run()\nfunction run()\n${body}\nend\n`)).toEqual([]);
  });

  test("a function holding a syntax error is not checked", () => {
    expect(messages("& run()\nfunction run()\n local function helper() end\n public x\nend\n")).toEqual([]);
  });

  test("a write is not a use", () => {
    expect(messages("& run()\nfunction run()\n local function helper() end\n helper = nil\nend\n")).toEqual([message("helper")]);
  });

  test("a function value assigned to a local is LocalUnused's, not FunctionUnused's", () => {
    const found = diagnoseDetailed("& run()\nfunction run()\n local helper = function() end\nend\n").filter((d) => d.code === "FunctionUnused" || d.code === "LocalUnused");
    expect(found.map((d) => d.code)).toEqual(["LocalUnused"]);
  });
});

describe("FunctionUnused for a global function", () => {
  test("warns on the function's name", () => {
    expect(unused("function helper()\nend\n")).toEqual([
      {
        file: "main.sd",
        code: "FunctionUnused",
        message: message("helper"),
        severity: 2,
        range: { start: { line: 0, character: 9 }, end: { line: 0, character: 15 } },
      },
    ]);
  });

  test.each([
    ["a logic call", inScene("& helper()\n")],
    ["a logic write", inScene("& helper = nil\n")],
    ["a narrative interpolation", inScene("Result: {helper()}.\n")],
    ["a call shorthand interpolation", inScene("Result: {{helper()}}.\n")],
    ["a call from another function", "function other()\n  helper()\nend\n" + inScene("& other()\n")],
    ["a Sparkle handler closure", "layout main with\n button @click={ helper() }\nend\n"],
    ["a Sparkle handler reference", "layout main with\n button @click=helper\nend\n"],
    ["a choice's interpolation", inScene("+ {helper()} [Pick]\n  Picked.\n")],
    ["a divert's argument", inScene("-> scene_a(helper)\n") + "scene scene_a(f)\n  Arrived.\nend\n"],
    ["a divert's target", inScene("-> helper\n")],
    ["a define's value", "define item with\n  use = helper\nend\n"],
    ["a Luau string", inScene("& handlers = { \"helper\" }\n")],
    ["a narrative if condition", inScene("if helper() then\n  Yes.\nend\n")],
  ])("is silent for %s in another script", (_label, use) => {
    expect(programUnused({ "main.sd": "Ready.\n", "subject.sd": "function helper()\nend\n" })).toEqual([`subject.sd: ${message("helper")}`]);
    expect(programUnused({ "main.sd": "Ready.\n", "subject.sd": "function helper()\nend\n", "use.sd": use })).toEqual([]);
  });

  test.each([
    ["an underscore-prefixed name", "function _helper()\nend\n"],
    ["a member", "& T = {}\nfunction T.helper()\nend\n"],
    ["a method", "& T = {}\nfunction T:helper()\nend\n"],
    ["a prelude global", "function config()\nend\n"],
    ["a function missing its end", "function helper()\n  if true then\n& helper()\n"],
  ])("is silent for %s", (_label, source) => {
    expect(messages(source)).toEqual([]);
  });

  test.each([
    ["dialogue", inScene("The helper is here.\n")],
    ["a choice's text", inScene("+ [Ask the helper]\n  Asked.\n")],
    ["a comment", "// helper\n" + inScene("& x = 1 -- helper\n")],
  ])("a mention in %s is not a use", (_label, use) => {
    expect(programUnused({ "main.sd": "Ready.\n", "subject.sd": "function helper()\nend\n", "use.sd": use })).toEqual([`subject.sd: ${message("helper")}`]);
  });

  test("a complete definition inside a function missing an end is silent", () => {
    expect(messages("& run()\nfunction run()\n do\n function helper() end\nend\n")).toEqual([]);
  });

  test("a definition inside a function holding a syntax error is silent", () => {
    expect(messages("& run()\nfunction run()\n function helper() end\n public x\nend\n")).toEqual([]);
  });

  test.each([
    ["a construct the grammar lacks", " class C\n end\n"],
    ["a statement the reading recovers from", " public x\n end\n"],
  ])("a call another script's misread function loses is still a use (%s)", (_label, broken) => {
    expectSubjectWarnsAlone();
    expect(programUnused({ "main.sd": `function caller()\n${broken} helper()\nend\n& caller()\n`, "subject.sd": "function helper()\nend\n" })).toEqual([]);
  });

  test("edits to a misread caller change the warning while the defining script stays cached", () => {
    const compiler = testCompiler();
    const file = (path: string, text: string) => ({ uri: `inmemory:///${path}`, type: "script" as const, name: path.replace(/\.sd$/, ""), ext: "sd", text, version: 1, languageId: "sparkdown" });
    const broken = "function caller()\n public x\n end\n print(1)\nend\n& caller()\n";
    compiler.configure({ files: [file("main.sd", broken), file("subject.sd", "function helper()\nend\n")] });
    const found = () => {
      const program: SparkProgram = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
      return (program.diagnostics?.["inmemory:///subject.sd"] ?? []).filter((d) => d.code === "FunctionUnused").length;
    };
    const update = (text: string, version: number) => compiler.updateDocument({ textDocument: { uri: "inmemory:///main.sd", version }, contentChanges: [{ text }] });
    expect(found()).toBe(1);
    const tree = compiler.documents.tree("inmemory:///subject.sd");
    update(broken.replace("print(1)", "helper()"), 2);
    expect(found()).toBe(0);
    update("function caller()\n print(1)\nend\n& caller()\n", 3);
    expect(found()).toBe(1);
    update(broken.replace("print(1)", "print(helper)"), 4);
    expect(found()).toBe(0);
    expect(compiler.documents.tree("inmemory:///subject.sd")).toBe(tree);
  });

  test("a name on a line with a syntax error is a use", () => {
    expectSubjectWarnsAlone();
    expect(programUnused({ "main.sd": "& v = 0x10i helper\n", "subject.sd": "function helper()\nend\n" })).toEqual([]);
  });

  test("a function defined inside another function is global", () => {
    expect(messages("& run()\nfunction run()\n function helper() end\nend\n")).toEqual([message("helper")]);
  });

  test("a second definition is not a use, and the name warns once at its last", () => {
    expect(unused("function helper()\nend\nfunction helper()\nend\n").map((d) => d.range!.start.line)).toEqual([2]);
  });

  test("a keyword the grammar reads in place of the name silences it", () => {
    expect(messages("function match()\nend\n")).toEqual([message("match")]);
    expect(messages("function match()\nend\n& match(1)\n")).toEqual([]);
  });

  test("an unchanged script gains and loses its warning as another script changes or leaves", () => {
    const compiler = testCompiler();
    const file = (path: string, text: string) => ({ uri: `inmemory:///${path}`, type: "script" as const, name: path.replace(/\.sd$/, ""), ext: "sd", text, version: 1, languageId: "sparkdown" });
    compiler.configure({ files: [file("main.sd", "Ready.\n"), file("subject.sd", "function helper()\nend\n"), file("use.sd", inScene("& helper()\n"))] });
    const found = () => {
      const program: SparkProgram = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
      return (program.diagnostics?.["inmemory:///subject.sd"] ?? []).filter((d) => d.code === "FunctionUnused").length;
    };
    const update = (path: string, text: string, version: number) => compiler.updateDocument({ textDocument: { uri: `inmemory:///${path}`, version }, contentChanges: [{ text }] });
    expect(found()).toBe(0);
    const tree = compiler.documents.tree("inmemory:///subject.sd");
    update("use.sd", inScene("Nothing.\n"), 2);
    expect(found()).toBe(1);
    update("use.sd", inScene("& helper()\n"), 3);
    expect(found()).toBe(0);
    compiler.removeFile({ file: { uri: "inmemory:///use.sd" } } as never);
    expect(found()).toBe(1);
    expect(compiler.documents.tree("inmemory:///subject.sd")).toBe(tree);
  });
});
