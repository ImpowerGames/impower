// GlobalUsedAsLocal (I-607): a global only one function uses, or one every
// function writes before it reads. The upstream cases are in
// `luau-conformance/LintCandidatesScope.test.ts`; these are the controls
// around them and the program-wide form. An accidental global is story state
// that goes into save files, so a use the reading may not show silences it.

import { describe, expect, test } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { testCompiler } from "../engineUnderTest";
import { diagnoseDetailed, diagnoseFilesDetailed } from "../luau-conformance/diagnosticTestHarness";

const found = (source: string) => diagnoseDetailed(source).filter((d) => d.code === "GlobalUsedAsLocal");
const messages = (source: string) => found(source).map((d) => d.message);
const programFound = (sources: Record<string, string>) =>
  diagnoseFilesDetailed(sources)
    .filter((d) => d.code === "GlobalUsedAsLocal")
    .map((d) => `${d.file}: ${d.message}`);
const only = (name: string, fn: string) => `Global '${name}' is only used in the enclosing function '${fn}'; consider changing it to local`;
const onlyAt = (name: string, line: number) => `Global '${name}' is only used in the enclosing function defined at line ${line}; consider changing it to local`;
const never = (name: string) => `Global '${name}' is never read before being written. Consider changing it to local`;

// `score` is written and read only inside `f`.
const SCORE = "function f()\n  score = 1\n  return score\nend\n& f()\n";
// `score` is written, then read, in each of two functions.
const SCORE_TWICE = "function f()\n  score = 1\n  return score\nend\nfunction g()\n  score = 2\n  return score\nend\n& f()\n& g()\n";

describe("GlobalUsedAsLocal in one function", () => {
  test("warns at the global's first reference, as a warning", () => {
    expect(found(SCORE)).toEqual([
      {
        file: "main.sd",
        code: "GlobalUsedAsLocal",
        message: only("score", "f"),
        severity: 2,
        range: { start: { line: 1, character: 2 }, end: { line: 1, character: 7 } },
      },
    ]);
  });

  test("a top-level story function is a function, so it is the one named", () => {
    expect(messages("function story()\n  local function helper() score = 1 end\n  helper()\n  return score\nend\n& story()\n")).toEqual([only("score", "story")]);
  });

  test("the innermost function that holds every reference is named", () => {
    expect(messages("function story()\n  local f = function()\n    score = 1\n    return score\n  end\n  return f()\nend\n& story()\n")).toEqual([onlyAt("score", 2)]);
  });

  test("a global function defined and called only in one function", () => {
    expect(messages("function outer()\n  function helper() return 1 end\n  return helper()\nend\n& outer()\n")).toEqual([only("helper", "outer")]);
  });

  test("a read before the write still uses it only in the function", () => {
    expect(messages("function f()\n  score = (score or 0) + 1\nend\n& f()\n")).toEqual([only("score", "f")]);
  });

  test.each([
    ["a member's name", "function f(t)\n  score = t.score\n  return score\nend\n& f({})\n"],
    ["a method's name", "function f(t)\n  score = t:score()\n  return score\nend\n& f({})\n"],
    ["a table's record key", "function f()\n  score = 1\n  local t = {score = 7}\n  return score, t\nend\n& f()\n"],
    ["a table type's property", "function f(t: {score: number})\n  score = t\n  return score\nend\n& f({score = 1})\n"],
  ])("%s of the same spelling is a field, not a use", (_label, source) => {
    expect(messages(source)).toEqual([only("score", "f")]);
  });

  test("a function the author names run is reported, unlike the harness's wrapper", () => {
    const outer = "function outer()\n  local function run()\n    score = 1\n    return score\n  end\n  return run()\nend\n";
    expect(messages(`${outer}& outer()\n`)).toEqual([only("score", "run")]);
    // With a run of its own in the script, the wrapper's warning is kept too.
    expect(messages(`function run()\n${outer}return outer()\nend\n& run()\n`)).toEqual([only("outer", "run"), only("score", "run")]);
  });

  test("a compound write alone assigns nothing", () => {
    expect(messages("function f()\n  score += 1\n  return score\nend\n& f()\n")).toEqual([]);
  });
});

describe("GlobalUsedAsLocal is silent for a use outside the function", () => {
  test.each([
    ["an interpolation", "Score: {score}\n"],
    ["a narrative logic line", "& print(score)\n"],
    ["a write in a narrative logic line", "& score = 0\n"],
    ["a scene's Luau", "== s\n& print(score)\n"],
    ["a Sparkle handler's statements", "layout main with\n button @click={ print(score) }\nend\n"],
    ["a bare Sparkle handler", "layout main with\n button @click=score\nend\n"],
    ["a Luau string", "& print(\"score\")\n"],
    ["a type", "type T = typeof(score)\n"],
    ["another function", "function g()\n  return score\nend\n& g()\n"],
  ])("%s", (_label, use) => {
    expect(messages(`${SCORE}${use}`)).toEqual([]);
  });

  test("a read in another script", () => {
    expect(programFound({ "main.sd": "include other.sd\n" + SCORE, "other.sd": "Score: {score}\n" })).toEqual([]);
  });
});

describe("GlobalUsedAsLocal is silent for a declared or unknown global", () => {
  test.each([
    ["a store", "store score = 0\n"],
    ["a top-level const", "const score = 0\n"],
    ["a local in a script's outermost block", "local score = 0\n"],
  ])("%s", (_label, declaration) => {
    expect(messages(`${declaration}${SCORE}`)).toEqual([]);
  });

  test("a local in another script's outermost block", () => {
    expect(programFound({ "main.sd": "include other.sd\n" + SCORE, "other.sd": "local score = 0\n" })).toEqual([]);
  });

  test("a built-in", () => {
    expect(messages("function f()\n  print = 1\n  return print\nend\n& f()\n")).toEqual([]);
  });

  test("the placeholder", () => {
    expect(messages("function f()\n  _ = 1\n  return _\nend\n& f()\n")).toEqual([]);
  });

  test("a function written in a type", () => {
    expect(messages("type T = typeof(function() score = 1 return score end)\n")).toEqual([]);
  });

  test("a statement holding a syntax error", () => {
    expect(messages("function f()\n  score = 1\n  return score +\nend\n& f()\n")).toEqual([]);
  });

  test("a keyword the grammar reads in place of the name", () => {
    const source = "function f()\n  match = 1\n  return match\nend\n& f()\n";
    expect(messages(source)).toEqual([only("match", "f")]);
    expect(messages(`${source}& match(1)\n`)).toEqual([]);
  });
});

describe("GlobalUsedAsLocal for a global every function writes first", () => {
  test("warns once, in the first script by URI", () => {
    expect(messages(SCORE_TWICE)).toEqual([never("score")]);
    expect(programFound({ "main.sd": "include other.sd\nfunction f()\n  score = 1\n  return score\nend\n& f()\n", "other.sd": "function g()\n  score = 2\n  return score\nend\n& g()\n" })).toEqual([`main.sd: ${never("score")}`]);
  });

  test.each([
    ["a write inside an if", "function h()\n  if true then score = 3 end\n  return score\nend\n& h()\n"],
    ["a write inside a loop", "function h()\n  for i = 1, 2 do score = i end\n  return score\nend\n& h()\n"],
    ["a read by the write's own values", "function h()\n  score = score or 3\nend\n& h()\n"],
    ["a read in a nested function", "function h()\n  local read = function() return score end\n  score = 3\n  return read()\nend\n& h()\n"],
    ["a read before the write", "function h()\n  print(score)\n  score = 3\nend\n& h()\n"],
  ])("a read that may see the old value silences it: %s", (_label, third) => {
    expect(messages(`${SCORE_TWICE}${third}`)).toEqual([]);
  });

  test("a write outside every function silences it", () => {
    expect(messages(`${SCORE_TWICE}== s\n& score = 0\n`)).toEqual([]);
  });
});

describe("GlobalUsedAsLocal over the program", () => {
  test("a .luau file's mention of the name is a use", () => {
    const compiler = testCompiler();
    compiler.configure({
      files: [
        { uri: "inmemory:///main.sd", type: "script", name: "main", ext: "sd", text: `run "helpers"\n${SCORE}`, version: 1, languageId: "sparkdown" },
        { uri: "inmemory:///helpers.luau", type: "script", name: "helpers", ext: "luau", text: "print(score)\n", version: 1, languageId: "sparkdown" },
      ],
    } as never);
    const program: SparkProgram = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
    const all = Object.values(program.diagnostics ?? {}).flat();
    expect(all.filter((d) => d.code === "GlobalUsedAsLocal")).toEqual([]);
  });

  test("an unchanged script gains and loses its warning as another script changes", () => {
    const compiler = testCompiler();
    const file = (path: string, text: string) => ({ uri: `inmemory:///${path}`, type: "script" as const, name: path.replace(/\.sd$/, ""), ext: "sd", text, version: 1, languageId: "sparkdown" });
    compiler.configure({ files: [file("main.sd", "include subject.sd\ninclude use.sd\nReady.\n"), file("subject.sd", SCORE), file("use.sd", "Score: {score}\n")] });
    const count = () => {
      const program: SparkProgram = compiler.compile({ textDocument: { uri: "inmemory:///main.sd" } }).program;
      return (program.diagnostics?.["inmemory:///subject.sd"] ?? []).filter((d) => d.code === "GlobalUsedAsLocal").length;
    };
    const update = (text: string, version: number) => compiler.updateDocument({ textDocument: { uri: "inmemory:///use.sd", version }, contentChanges: [{ text }] });
    expect(count()).toBe(0);
    const tree = compiler.documents.tree("inmemory:///subject.sd");
    update("Ready.\n", 2);
    expect(count()).toBe(1);
    update("Score: {score}\n", 3);
    expect(count()).toBe(0);
    expect(compiler.documents.tree("inmemory:///subject.sd")).toBe(tree);
  });
});
