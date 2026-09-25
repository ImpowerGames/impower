// Synthetic names minted from a source offset are unique across files. An
// offset is a position within one file, so two files each holding a
// synthetic at the same offset must still get names no other file shares.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

const MAIN_URI = "file://proj/main.sd";

type Project = Record<string, string>;

const uriOf = (name: string) => `file://proj/${name}.sd`;

const file = (uri: string, text: string, version: number): File => ({
  uri,
  type: "script",
  name: uri.split("/").at(-1)!.split(".")[0]!,
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

function quiet<T>(fn: () => T): T {
  const realWarn = console.warn;
  const realError = console.error;
  console.warn = () => {};
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.warn = realWarn;
    console.error = realError;
  }
}

function configure(compiler: SparkdownCompiler, project: Project, version: number) {
  compiler.configure({
    files: Object.entries(project).map(([name, text]) => file(uriOf(name), text, version)),
  });
}

function compileOnce(project: Project) {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    configure(compiler, project, 1);
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

function errors(program: any): string[] {
  return Object.values(program.diagnostics ?? {}).flatMap((list: any) =>
    list
      .filter((d: any) => d.severity === 1)
      .map((d: any) => (typeof d.message === "string" ? d.message : (d.message?.value ?? ""))),
  );
}

function globalAfterRun(program: any, name: string): unknown {
  const story = new RuntimeStory(program.compiled as Record<string, any>);
  quiet(() => story.ContinueMaximally());
  return story.variablesState.$(name);
}

// Compiles `project`, prepends `insert` to the file `name`, and returns the
// incremental compile of the edited project beside a cold compile of it.
function incrementalAndCold(project: Project, name: string, insert: string): [string, string] {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    configure(compiler, project, 1);
    compiler.compile({ textDocument: { uri: MAIN_URI } });
    const at = { line: 0, character: 0 };
    compiler.updateDocument({
      textDocument: { uri: uriOf(name), version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: insert }],
    });
    const incremental = compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
    const fresh = new SparkdownCompiler();
    configure(fresh, { ...project, [name]: insert + project[name]! }, 2);
    const cold = fresh.compile({ textDocument: { uri: MAIN_URI } }).program;
    return [JSON.stringify(incremental.compiled), JSON.stringify(cold.compiled)];
  });
}

describe("synthetic names in two files", () => {
  it("two anonymous functions at the same offset of their files compile", () => {
    const program = compileOnce({
      main: ["include fa.sd", "include fb.sd", "store x = fa_f() + fb_f()", ""].join("\n"),
      fa: ["store fa_f = function() return 1 end", ""].join("\n"),
      fb: ["store fb_f = function() return 2 end", ""].join("\n"),
    });
    expect(errors(program)).toEqual([]);
    expect(globalAfterRun(program, "x")).toBe(3);
  });

  it("a method-call temp copied into another file keeps the cold names after an edit", () => {
    const project: Project = {
      main: [
        "store a = { add = function(self, n) return self end }",
        "store r = 0",
        "include pre.sd",
        "include shared.sd",
        "",
      ].join("\n"),
      pre: ["  Before.", ""].join("\n"),
      shared: ["& r = a:add(1):add(2)", ""].join("\n"),
    };
    const [incremental, cold] = incrementalAndCold(project, "pre", "& r = a:add(1):add(2)\n");
    expect(incremental).toContain("__synth_");
    expect(incremental).toBe(cold);
  });

  it("a loop copied into another file keeps the cold names after an edit", () => {
    // The two functions' names are the same length, so each loop starts at
    // the same offset of its file.
    const loopIn = (name: string) =>
      [`function ${name}()`, "  for i = 1, 2 do", "    r = r + i", "  end", "end", ""].join("\n");
    const project: Project = {
      main: ["store r = 0", "include pre.sd", "include shared.sd", ""].join("\n"),
      pre: ["  Before.", ""].join("\n"),
      shared: loopIn("sf"),
    };
    const [incremental, cold] = incrementalAndCold(project, "pre", loopIn("pf"));
    expect(incremental).toContain("__synth_");
    expect(incremental).toBe(cold);
  });
});
