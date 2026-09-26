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
function incrementalAndCold(project: Project, name: string, insert: string): [any, any] {
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
    return [incremental, cold];
  });
}

// How many distinct synthetic names a program holds.
function synthCount(compiled: string): number {
  return new Set(compiled.match(/__synth_\d+/g) ?? []).size;
}

// Edits `pre.sd` so it starts with the same code `shared.sd` holds (both
// wrapped in a function of a same-length name, so the code sits at the same
// offset of each file), and checks the incremental program against a cold
// one. `names` is the number of synthetic names the two copies and `main`
// hold together: each file's copy must keep names of its own.
function expectCopiedCodeMatchesCold(main: string[], body: (name: string) => string, names: number) {
  const project: Project = {
    main: [...main, "include pre.sd", "include shared.sd", ""].join("\n"),
    pre: ["  Before.", ""].join("\n"),
    shared: body("sf"),
  };
  const [incremental, cold] = incrementalAndCold(project, "pre", body("pf"));
  expect(errors(incremental)).toEqual([]);
  expect(errors(cold)).toEqual([]);
  const incrementalText = JSON.stringify(incremental.compiled);
  expect(synthCount(incrementalText)).toBe(names);
  expect(incrementalText).toBe(JSON.stringify(cold.compiled));
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

  it("two define methods at the same offset of their files compile", () => {
    const defineIn = (name: string) =>
      [`define ${name} with`, "  function get()", `    return ${name === "ca" ? 1 : 2}`, "  end", "end", ""].join("\n");
    const program = compileOnce({
      main: ["include fa.sd", "include fb.sd", "store x = ca:get() + cb:get()", ""].join("\n"),
      fa: defineIn("ca"),
      fb: defineIn("cb"),
    });
    expect(errors(program)).toEqual([]);
    expect(globalAfterRun(program, "x")).toBe(3);
  });

  it("a method-call temp copied into another file keeps the cold names after an edit", () => {
    // `main`'s anonymous function, and two receiver temps per chain.
    expectCopiedCodeMatchesCold(
      ["store a = { add = function(self, n) return self end }", "store r = 0"],
      (name) => [`function ${name}()`, "  r = a:add(1):add(2)", "end", ""].join("\n"),
      5,
    );
  });

  it("a numeric for loop copied into another file keeps the cold names after an edit", () => {
    // Three temps and three labels per loop.
    expectCopiedCodeMatchesCold(
      ["store r = 0"],
      (name) => [`function ${name}()`, "  for i = 1, 2 do", "    r = r + i", "  end", "end", ""].join("\n"),
      12,
    );
  });

  it("while, repeat and generic for loops copied into another file keep the cold names after an edit", () => {
    // Two labels per `while`, three per `repeat`, and three temps and two
    // labels per generic `for`.
    expectCopiedCodeMatchesCold(
      ["store r = 0"],
      (name) =>
        [
          `function ${name}()`,
          "  while r < 1 do",
          "    r = r + 1",
          "  end",
          "  repeat",
          "    r = r + 1",
          "  until r > 3",
          "  for _, v in ipairs({ 1, 2 }) do",
          "    r = r + v",
          "  end",
          "end",
          "",
        ].join("\n"),
      20,
    );
  });
});

describe("authored names shaped like synthetic ones", () => {
  it("keep their names in the program", () => {
    const program = compileOnce({
      main: [
        "store __anon_fn_x__1 = 4",
        "",
        "function f__redef_x__1()",
        "  return 7",
        "end",
        "",
      ].join("\n"),
    });
    expect(errors(program)).toEqual([]);
    const story = new RuntimeStory(program.compiled as Record<string, any>);
    expect(story.HasFunction("f__redef_x__1")).toBe(true);
    expect(quiet(() => story.EvaluateFunction("f__redef_x__1"))).toBe(7);
    expect(JSON.stringify(program.compiled)).toContain('"__anon_fn_x__1"');
  });
});
