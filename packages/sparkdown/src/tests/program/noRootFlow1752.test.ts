import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { SymbolKind } from "../../program/ProgramSymbols";
import { testCompiler, testStory } from "../engineUnderTest";

function compile(uri: string, text: string, others: Record<string, string> = {}) {
  const compiler = testCompiler();
  compiler.configure({
    files: Object.entries({ [uri]: text, ...others }).map(([fileUri, fileText]) => ({
      uri: fileUri,
      type: "script",
      name: fileUri.slice(fileUri.lastIndexOf("/") + 1).replace(/\.[^.]+$/, ""),
      ext: fileUri.endsWith(".luau") ? "luau" : "sd",
      text: fileText,
      version: 1,
      languageId: "sparkdown",
    })),
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
});

describe("a program compiled from a .luau file runs nothing (I-1752)", () => {
  it.each([
    ["statements", "count = (count or 0) + 1\ntotal = 40 + 2\n"],
    ["an if block", "count = 1\nif true then\n  count = 3\nend\n"],
    ["a loop that never ends", "count = 1\nwhile true do\n  count = count + 1\nend\n"],
    ["a call of a missing function", "count = 1\nmissing()\n"],
    ["a return inside a block", "count = 1\nif true then\n  return 42\nend\ncount = 2\n"],
    ["a return at its end", "count = 1\nreturn count\n"],
  ])("with %s", (_, text) => {
    const { program, errors } = compile("inmemory:///main.luau", text);
    expect(errors).toEqual([]);
    expect(program.chunks).toBeDefined();
    const story = testStory(program.chunks);
    expect(story.variablesState.$("count") == null).toBe(true);
    expect(story.canContinue).toBe(false);
  });

  it("reports an unfinished block by its syntax error alone", () => {
    const { errors } = compile("inmemory:///main.luau", "while true do\n  x()\n");
    expect(errors.some((e: string) => e.includes("Expected 'end'"))).toBe(true);
    expect(errors.filter((e: string) => e.includes("compile stopped"))).toEqual([]);
  });

  it("runs no scene another script declares, start included", () => {
    const { program, errors } = compile(
      "inmemory:///entry.luau",
      "local n = 99\ncount = n\nif true then\n  count = 100\nend\n",
      { "inmemory:///main.sd": "store m = 2\n\nscene start\n  Value {m}.\n  done\nend\n" },
    );
    expect(errors).toEqual([]);
    const story = testStory(program.chunks);
    expect(story.canContinue).toBe(false);
    expect(story.variablesState.$("count") == null).toBe(true);
    story.ChooseStart();
    expect(story.canContinue).toBe(false);
  });

  it("still runs a .luau file a run line loads", () => {
    const { program, errors } = compile(
      "inmemory:///main.sd",
      'run "helper"\n\nscene start\n  Value {count}.\n  done\nend\n',
      { "inmemory:///helper.luau": "count = 7\nif true then\n  count = count + 1\nend\n" },
    );
    expect(errors).toEqual([]);
    const story = testStory(program.chunks);
    expect(story.Continue()?.trim()).toBe("Value 8.");
  });
});
