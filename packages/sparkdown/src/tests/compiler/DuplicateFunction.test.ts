// DuplicateFunction (I-605): a function statement or local function whose
// name an earlier one in the same block already defines. The upstream cases
// are in `luau-conformance/LintCandidatesScope.test.ts`; these are the
// controls around them, the top level the compiler already covers, and the
// program-wide form for members of a global table.

import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { testCompiler } from "../engineUnderTest";
import { diagnoseDetailed, diagnoseFilesDetailed } from "../luau-conformance/diagnosticTestHarness";

const duplicates = (source: string) => diagnoseDetailed(source).filter((d) => d.code === "DuplicateFunction");
const messages = (source: string) => duplicates(source).map((d) => d.message);
const inFunction = (body: string) => messages(`& run()\nfunction run()\n${body}\nend\n`);
const programDuplicates = (sources: Record<string, string>) =>
  diagnoseFilesDetailed(sources)
    .filter((d) => d.code === "DuplicateFunction")
    .map((d) => `${d.file}:${d.range!.start.line}: ${d.message}`);
const message = (name: string, line: number) => `Duplicate function definition: '${name}' also defined on line ${line}`;

describe("DuplicateFunction in one block", () => {
  test("warns on the second definition's name, against the first", () => {
    expect(duplicates("& run()\nfunction run()\n function helper() end\n function helper() end\nend\n")).toEqual([
      {
        file: "main.sd",
        code: "DuplicateFunction",
        message: message("helper", 3),
        severity: 2,
        range: { start: { line: 3, character: 10 }, end: { line: 3, character: 16 } },
      },
    ]);
  });

  test("a third definition is reported against the first, as in Luau", () => {
    expect(inFunction(" local function f() end\n local function f() end\n local function f() end\n f()")).toEqual([message("f", 3), message("f", 3)]);
  });

  test("a local function and a global function of one name in one block are duplicates, as Luau names both by their text", () => {
    expect(inFunction(" local function f() end\n f()\n function f() end")).toEqual([message("f", 3)]);
  });

  test("a method and a field function of one member are duplicates", () => {
    expect(inFunction(" local T = {}\n function T:x() end\n function T.x() end\n return T")).toEqual([message("T.x", 4)]);
  });

  test("a deeper member path is named in full", () => {
    expect(inFunction(" local T = { a = {} }\n function T.a.x() end\n function T.a:x() end\n return T")).toEqual([message("T.a.x", 4)]);
  });

  test.each([
    ["separate functions", " local function a() function g() end end\n local function b() function g() end end\n a() b()"],
    ["an inner block and its enclosing block", " function g() end\n do\n  function g() end\n end"],
    ["separate arms of an if", " if math.random() > 0.5 then\n  function g() end\n else\n  function g() end\n end"],
    ["separate loop bodies", " for i = 1, 2 do function g() end end\n while false do function g() end end"],
    ["different members", " local T = {}\n function T.x() end\n function T.y() end\n return T"],
    ["a function value assigned to the name", " function g() end\n g = function() end"],
  ])("is silent for %s", (_label, body) => {
    expect(inFunction(body)).toEqual([]);
  });

  test("functions written in a type are left alone", () => {
    expect(inFunction(" local t: typeof(function() local function f() end local function f() end f() end) = nil\n return t")).toEqual([]);
  });

  test("a function holding a block missing its end is left alone", () => {
    expect(inFunction(" local function f() end\n local function f() end\n f()\n if true then")).toEqual([]);
  });

  test("a statement holding a syntax error is left alone", () => {
    expect(inFunction(" local T = {}\n function T.x() end\n function T.x() public y end\n return T")).toEqual([]);
  });

  test("a statement holding a syntax error is left alone with the blocks in it", () => {
    expect(messages("& run()\nfunction run()\n public y\n local function f() end\n local function f() end\n f()\nend\n")).toEqual([]);
    expect(inFunction(" do\n  public y\n  local function f() end\n  local function f() end\n  f()\n end")).toEqual([]);
  });

  // A structural word with no arms is a name (I-1310), so its call is one
  // like any other.
  test("a structural word's call is a name's", () => {
    const body = (name: string) => ` local function ${name}() end\n local function ${name}() end\n ${name}(1)`;
    expect(inFunction(body("match"))).toEqual([message("match", 3)]);
    expect(inFunction(body("match"))).toEqual(inFunction(body("hp")).map((m) => m.replace("'hp'", "'match'")));
  });

  test("a name the grammar reads as an alternator's keyword is left alone", () => {
    expect(inFunction(" local function match() end\n local function match() end\n return match(1) | a = 1 end")).toEqual([]);
  });

  test("a narrative if's arms are separate blocks, and one arm is a block", () => {
    expect(messages("& v = true\nif v then\n  & function x() return 1 end\nelse\n  & function x() return 2 end\nend\nValue {x()}.\n")).toEqual([]);
    expect(messages("& v = true\nif v then\n  & function x() return 1 end\n  & function x() return 2 end\nend\nValue {x()}.\n")).toEqual([message("x", 3)]);
  });
});

describe("DuplicateFunction at a script's top level", () => {
  // Each plain-named function there is a story function, and the compiler
  // reports a second one of the name as a duplicate identifier.
  test.each([
    ["global functions", "function x() return 1 end\nfunction x() return 2 end\nValue {x()}.\n"],
    ["functions in separate scenes, which the reading lifts to the top level", "& x()\n== A\nfunction x() end\n== B\nfunction x() end\n"],
  ])("leaves plain-named %s to the compiler's duplicate-identifier error", (_label, source) => {
    const found = diagnoseDetailed(source);
    expect(found.filter((d) => d.code === "DuplicateFunction")).toEqual([]);
    expect(found.some((d) => d.message.startsWith("Duplicate identifier `x`. A function named `x` already exists"))).toBe(true);
  });

  // A local function in a scene is a local of the scene's scope, which a
  // later one of the name shadows, as in Luau: Luau's lint warns of the
  // second, and the compiler reports no duplicate story function.
  test("lints a scene's second local function of one name as Luau does, with no duplicate identifier", () => {
    const found = diagnoseDetailed(
      "-> S\nscene S\n  local function x() return 1 end\n  local function x() return 2 end\n  Value {x()}.\nend\n",
    );
    expect(found.filter((d) => d.message.startsWith("Duplicate identifier"))).toEqual([]);
    expect(found.filter((d) => d.code === "DuplicateFunction").map((d) => [d.severity, d.range.start.line, d.message])).toEqual([
      [2, 3, "Duplicate function definition: 'x' also defined on line 3"],
    ]);
  });

  test("compares members, which the compiler does not", () => {
    expect(duplicates("store T = {}\nfunction T.x() end\nfunction T:x() end\n& T.x()\n").map((d) => [d.message, d.range!.start.line])).toEqual([[message("T.x", 2), 2]]);
  });
});

describe("DuplicateFunction across scripts", () => {
  const sources = (chapter: string) => ({ "main.sd": "store T = {}\nfunction T.x() end\n& T.x()\n", "chapter.sd": chapter });

  test("a member of a global table defined at two scripts' top levels warns in the later script by URI, naming the other", () => {
    expect(programDuplicates(sources("\nfunction T.x() end\n"))).toEqual([`main.sd:1: ${message("T.x", 2)} in 'chapter.sd'`]);
  });

  test("each script's later definitions are reported against its own first", () => {
    expect(programDuplicates(sources("function T.x() end\nfunction T.x() end\n"))).toEqual([`chapter.sd:1: ${message("T.x", 1)}`, `main.sd:1: ${message("T.x", 1)} in 'chapter.sd'`]);
  });

  test("a story constant's table is a global table", () => {
    expect(programDuplicates({ "main.sd": "const T = {}\nfunction T.x() end\n& T.x()\n", "chapter.sd": "function T.x() end\n" })).toEqual([`main.sd:1: ${message("T.x", 1)} in 'chapter.sd'`]);
  });

  test.each([
    ["a definition inside a function", "function setup()\n function T.x() end\nend\n"],
    ["a different member", "function T.y() end\n"],
  ])("is silent for %s", (_label, chapter) => {
    // The chapter is read: the same member at its top level warns.
    expect(programDuplicates(sources("function T.x() end\n"))).not.toEqual([]);
    expect(programDuplicates(sources(chapter))).toEqual([]);
  });

  // Only main holds a top-level local, so the local table is main's.
  test("is silent for a member of a local table", () => {
    const main = "& local T = {}\nfunction T.x() end\n& T.x()\n";
    // The chapter is read: a second definition of its own member warns there.
    expect(programDuplicates({ "main.sd": main, "chapter.sd": "store T = {}\nfunction T.x() end\nfunction T.x() end\n" })).not.toEqual([]);
    expect(programDuplicates({ "main.sd": main, "chapter.sd": "store T = {}\nfunction T.x() end\n" })).toEqual([]);
  });

  test("an unchanged script gains and loses its warning as another script changes or leaves", () => {
    const compiler = testCompiler();
    const file = (path: string, text: string) => ({ uri: `inmemory:///${path}`, type: "script" as const, name: path.replace(/\.sd$/, ""), ext: "sd", text, version: 1, languageId: "sparkdown" });
    compiler.configure({ files: [file("main.sd", "& T.x()\nReady.\n"), file("subject.sd", "store T = {}\nfunction T.x() end\n"), file("chapter.sd", "\n")] });
    const found = () => {
      const program: SparkProgram = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
      return (program.diagnostics?.["inmemory:///subject.sd"] ?? []).filter((d) => d.code === "DuplicateFunction").length;
    };
    const update = (path: string, text: string, version: number) => compiler.updateDocument({ textDocument: { uri: `inmemory:///${path}`, version }, contentChanges: [{ text }] });
    expect(found()).toBe(0);
    const tree = compiler.documents.tree("inmemory:///subject.sd");
    update("chapter.sd", "function T.x() end\n", 2);
    expect(found()).toBe(1);
    update("chapter.sd", "function T.y() end\n", 3);
    expect(found()).toBe(0);
    update("chapter.sd", "function T.x() end\n", 4);
    expect(found()).toBe(1);
    compiler.removeFile({ file: { uri: "inmemory:///chapter.sd" } } as never);
    expect(found()).toBe(0);
    expect(compiler.documents.tree("inmemory:///subject.sd")).toBe(tree);
  });
});
