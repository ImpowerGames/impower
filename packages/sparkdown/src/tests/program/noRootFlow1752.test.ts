import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { SymbolKind } from "../../program/ProgramSymbols";
import { testCompiler, testStory } from "../engineUnderTest";

function compile(uri: string, text: string) {
  const compiler = testCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: uri.endsWith(".luau") ? "luau" : "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  const result = compiler.compile({ textDocument: { uri } } as never) as any;
  const errors = Object.values(result.program.diagnostics ?? {})
    .flat()
    .filter((d: any) => d.severity === DiagnosticSeverity.Error)
    .map((d: any) => (typeof d.message === "string" ? d.message : d.message.value));
  return { program: result.program, errors };
}

describe("a program has no root flow (I-1752)", () => {
  it("registers only scenes, branches and functions as flows", () => {
    const { program, errors } = compile(
      "inmemory:///main.sd",
      "store n = 1\n\nscene start\n  Hello.\n  done\nend\n\nfunction f()\n  return 1\nend\n",
    );
    expect(errors).toEqual([]);
    const root = program.chunks;
    const flows = root.flowSequences().map((row: any) => [root.table.symbols[row.flow], row.kind]);
    expect(flows.sort()).toEqual(
      [
        ["f", SymbolKind.Function],
        ["start", SymbolKind.Scene],
      ].sort(),
    );
    expect(root.flowNamed("")).toBeUndefined();
  });

  it("starts the story in start", () => {
    const { program } = compile("inmemory:///main.sd", "scene start\n  Hello.\n  done\nend\n");
    const story = testStory(program.chunks);
    expect(story.Continue()?.trim()).toBe("Hello.");
    expect(story.ContinueMaximally()).toBe("");
  });

  it("stands nowhere when no scene is named start", () => {
    const { program } = compile("inmemory:///main.sd", "scene intro\n  Hello.\n  done\nend\n");
    const story = testStory(program.chunks);
    expect(story.canContinue).toBe(false);
    story.ChooseStart();
    expect(story.canContinue).toBe(false);
  });

  it("runs a .luau entry's top level once as the story starts", () => {
    const { program, errors } = compile(
      "inmemory:///main.luau",
      "count = (count or 0) + 1\ntotal = 40 + 2\n",
    );
    expect(errors).toEqual([]);
    const story = testStory(program.chunks);
    expect(story.variablesState.$("count")).toBe(1);
    expect(story.variablesState.$("total")).toBe(42);
    expect(story.canContinue).toBe(false);
    story.ResetState();
    expect(story.variablesState.$("count")).toBe(1);
  });

  it.each([
    ["an if block", "count = 1\nif true then\n  count = 3\nend\n", 3],
    ["a do block", "count = 1\ndo\n  count = 4\nend\n", 4],
    ["a for loop", "count = 1\nfor i = 1, 3 do\n  count = count + 1\nend\n", 4],
    ["a while loop", "count = 1\nwhile count < 5 do\n  count = count + 1\nend\n", 5],
    ["a local read by a later statement", "local a = 5\ncount = a + 1\n", 6],
    ["a return inside a block", "count = 1\nif true then\n  return 42\nend\ncount = 2\n", 1],
    ["a return its condition skips", "count = 1\nif false then\n  return 42\nend\ncount = 2\n", 2],
  ])("runs a .luau entry's top level with %s", (_, text, count) => {
    const { program, errors } = compile("inmemory:///main.luau", text);
    expect(errors).toEqual([]);
    const story = testStory(program.chunks);
    expect(story.variablesState.$("count")).toBe(count);
  });

  it("ends a .luau entry's top level at its return", () => {
    const { program, errors } = compile(
      "inmemory:///main.luau",
      "total = 40 + 2\nreturn total\n",
    );
    expect(errors).toEqual([]);
    const story = testStory(program.chunks);
    expect(story.variablesState.$("total")).toBe(42);
    expect(story.canContinue).toBe(false);
  });
});
