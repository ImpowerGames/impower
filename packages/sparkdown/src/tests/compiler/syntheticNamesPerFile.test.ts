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

// These tests read the current engine's compiled JSON for the synthetic names
// it holds, and several include a script with top-level content, which the
// program writer does not emit yet (#1681): they compile for the current
// engine until #705's deletion decides each one.
function configure(compiler: SparkdownCompiler, project: Project, version: number) {
  compiler.configure({
    programChunks: false,
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

// Each reserved-name error in `source` (the text of `main`) as
// `<zero-based line>:<name>`, in line order. An error whose range does not
// cover exactly the name's text shows the text it covers after the name.
function reservedAt(program: any, source: string): string[] {
  const lines = source.split("\n");
  return Object.values(program.diagnostics ?? {})
    .flatMap((list: any) => list)
    .filter((d: any) => d.severity === 1)
    .flatMap((d: any) => {
      const message =
        typeof d.message === "string" ? d.message : (d.message?.value ?? "");
      const m =
        /^'(__synth_\d+)' is reserved for names the compiler generates$/.exec(
          message,
        );
      if (!m) {
        return [];
      }
      const { start, end } = d.range;
      const covered =
        start.line === end.line
          ? (lines[start.line] ?? "").slice(start.character, end.character)
          : "<multiline>";
      return [{ line: start.line as number, name: m[1]!, covered }];
    })
    .sort((a, b) => a.line - b.line || a.name.localeCompare(b.name))
    .map(({ line, name, covered }) =>
      covered === name ? `${line}:${name}` : `${line}:${name} covers "${covered}"`,
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

// Compiles `text` in `main`, inserts `insert` at the start of the 0-based
// `line`, and returns the incremental compile beside a cold compile of the
// edited text, with the names of the flows the incremental compile carried.
function editMain(text: string, line: number, insert: string): [any, any, string[]] {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    configure(compiler, { main: text }, 1);
    compiler.compile({ textDocument: { uri: MAIN_URI } });
    const at = { line, character: 0 };
    compiler.updateDocument({
      textDocument: { uri: MAIN_URI, version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: insert }],
    });
    const incremental = compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
    const reused = [...((compiler as any)._reusedFlowsThisCompile ?? [])].map((f: any) => f?.identifier?.name);
    const lines = text.split("\n");
    lines.splice(line, 0, ...insert.split("\n").slice(0, -1));
    const fresh = new SparkdownCompiler();
    configure(fresh, { main: lines.join("\n") }, 2);
    return [incremental, fresh.compile({ textDocument: { uri: MAIN_URI } }).program, reused];
  });
}

function evaluate(program: any, fn: string): unknown {
  const story = new RuntimeStory(program.compiled as Record<string, any>);
  return quiet(() => story.EvaluateFunction(fn));
}

describe("assignment temps in a carried chunk", () => {
  it("compound and multi-target assignment temps keep the cold names after an edit above them", () => {
    // The scenes keep the function's chunk outside the region the edit
    // reparses, so the incremental compile carries it without lowering it.
    const scenes = [0, 1, 2, 3, 4, 5].flatMap((i) => [`scene s${i}`, `  Line ${i}.`, "end", ""]);
    const text = [
      "store t = { a = 0, b = 0 }",
      "",
      ...scenes,
      "function f()",
      "  t.a += 1",
      "  local x",
      "  x, t.b = 1, 2",
      "end",
      "",
    ].join("\n");
    const [incremental, cold, reused] = editMain(text, 4, "  An added line.\n");
    expect(reused).toContain("f");
    expect(errors(incremental)).toEqual([]);
    expect(errors(cold)).toEqual([]);
    const incrementalText = JSON.stringify(incremental.compiled);
    expect(incrementalText).toBe(JSON.stringify(cold.compiled));
    expect(incrementalText).not.toMatch(/__pa_|__mt_/);
  });

  // An anonymous function added above `f` shifts the ordinal of every
  // synthetic name after it, so the carried `g` has its loop labels renamed.
  it.each([
    ["numeric for", ["  for i = 1, 2 do", "    u.a += i", "  end"]],
    ["numeric for with a multi-target assignment", ["  for i = 1, 2 do", "    local z", "    z, u.a = i, u.a + i", "  end"]],
    ["while", ["  local n = 0", "  while n < 2 do", "    n = n + 1", "    u.a += n", "  end"]],
    ["repeat", ["  local n = 0", "  repeat", "    n = n + 1", "    u.a += n", "  until n >= 2"]],
    ["generic for", ["  for _, v in ipairs({ 1, 2 }) do", "    u.a += v", "  end"]],
    ["nested numeric for", ["  for i = 1, 2 do", "    for j = 1, 1 do", "      u.a = u.a + i", "    end", "  end"]],
  ])("a %s loop in a carried function still runs after the names before it shift", (_, body) => {
    const text = [
      "store u = { a = 0 }",
      "",
      "scene s0",
      "  Line 0.",
      "end",
      "",
      "function f()",
      "  u.a = u.a + 1",
      "end",
      "",
      "function g()",
      ...body,
      "  return u.a",
      "end",
      "",
    ].join("\n");
    const [incremental, cold] = editMain(text, 6, "& h = function() return 9 end\n\n");
    expect(errors(incremental)).toEqual([]);
    expect(JSON.stringify(incremental.compiled)).toBe(JSON.stringify(cold.compiled));
    expect(evaluate(incremental, "g")).toBe(3);
  });
});

describe("authored names shaped like synthetic ones", () => {
  it("keep their names in the program", () => {
    const program = compileOnce({
      main: [
        "store __anon_fn_x__1 = 4",
        "store __pa_base_1 = 5",
        "store __mt_1_0 = 6",
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
    expect(JSON.stringify(program.compiled)).toContain('"__pa_base_1"');
    expect(JSON.stringify(program.compiled)).toContain('"__mt_1_0"');
  });

  // `__synth_<n>` is the form the compiler gives its own synthetic names, so
  // an author's name of that shape would join their numbering and be renamed.
  it("report the canonical synthetic form as reserved", () => {
    const main = [
        "store f = function() return 1 end",
        "store __synth_0 = 9",
        "store g = __synth_0",
        "function __synth_4()",
        "  return 2",
        "end",
        "",
      ].join("\n");
    const program = compileOnce({ main });
    expect(reservedAt(program, main)).toEqual([
      "1:__synth_0",
      "2:__synth_0",
      "3:__synth_4",
    ]);
    // The name keeps its value; the anonymous function is numbered past it.
    expect(globalAfterRun(program, "__synth_0")).toBe(9);
  });

  it("report the canonical synthetic form as reserved in flow names", () => {
    const main = [
        "store obj = { add = function(self, n) return self end }",
        "",
        "-> __synth_1",
        "",
        "scene __synth_1",
        "  Hello.",
        "  -> __synth_1.__synth_2",
        "",
        "branch __synth_2",
        "  label __synth_3",
        "  Bye.",
        "end",
        "",
      ].join("\n");
    const program = compileOnce({ main });
    expect(reservedAt(program, main)).toEqual([
      "2:__synth_1",
      "4:__synth_1",
      "6:__synth_1",
      "6:__synth_2",
      "8:__synth_2",
      "9:__synth_3",
    ]);
  });

  it("report the canonical synthetic form as reserved in a property read", () => {
    const main = [
        "store f = function() return 1 end",
        'store obj = { ["__synth_1"] = 5 }',
        "store y = obj.__synth_1",
        "",
      ].join("\n");
    const program = compileOnce({ main });
    expect(reservedAt(program, main)).toEqual(["2:__synth_1"]);
  });

  it("report the canonical synthetic form as reserved in a define", () => {
    const main = [
        "store f = function() return 1 end",
        "define __synth_5 as character with",
        '  name = "Bob"',
        "end",
        "",
      ].join("\n");
    const program = compileOnce({ main });
    expect(reservedAt(program, main)).toEqual(["1:__synth_5"]);
  });

  it("report the canonical synthetic form as reserved in a reassignment", () => {
    const main = [
      "store f = function()",
      "  __synth_0 = 5",
      "  return __synth_0",
      "end",
      "store __synth_1 = 9",
      "__synth_1 = 1",
      "__synth_1 += 2",
      "& __synth_1 = 3",
      "",
    ].join("\n");
    const program = compileOnce({ main });
    expect(reservedAt(program, main)).toEqual([
      "1:__synth_0",
      "2:__synth_0",
      "4:__synth_1",
      "5:__synth_1",
      "6:__synth_1",
      "7:__synth_1",
    ]);
  });

  // These names reach the program as strings the synthetic-name pass never
  // renames, so they keep their names without a report.
  it("keep a match key, a layout and a component of the canonical form", () => {
    const program = compileOnce({
      main: [
        "store f = function() return 1 end",
        'store x = "__synth_0"',
        'store y = ""',
        "match (x)",
        '  | __synth_0 = y = "matched"',
        '  | other = y = "unmatched"',
        "end",
        "",
        "layout __synth_6 with",
        '  text "hi"',
        "end",
        "",
        "component __synth_7 with",
        '  text "hi"',
        "end",
        "",
      ].join("\n"),
    });
    expect(errors(program)).toEqual([]);
  });

  it("keep their names when only the prefix matches", () => {
    const program = compileOnce({
      main: ["store f = function() return 1 end", "store __synth_x = 9", ""].join("\n"),
    });
    expect(errors(program)).toEqual([]);
    expect(globalAfterRun(program, "__synth_x")).toBe(9);
  });
});
