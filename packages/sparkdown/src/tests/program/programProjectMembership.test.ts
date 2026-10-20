// A project is a folder (#1387, Feature #1386): every `.sd` script under the
// folder of the script a compile starts from is part of its story, with no
// include line. A subfolder holding its own main script is a project of its
// own, and a folder named `node_modules` or whose name begins with `.` is in
// no project. The script the compile starts from runs its top-level lines;
// every other script holds declarations only, which register main first and
// then by path.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { errorsOf, programCompiler, storyRun } from "./programHarness";

const ROOT = "file://proj/";
const MAIN = `${ROOT}main.sd`;
const ACT1 = `${ROOT}scripts/chapters/act1.sd`;
const DEFS = `${ROOT}scripts/defs.sd`;

const OUTSIDE_SCENE =
  "Only main.sd runs lines outside a scene. Move this into a scene or into main.sd.";
const INCLUDE_LINE =
  "Scripts in the project folder are part of the story. Delete this line.";

const quiet = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const lines = (...text: string[]) => [...text, ""].join("\n");

const compileProject = (texts: Record<string, string>, entry = MAIN) =>
  quiet(() => programCompiler(texts).compile(entry)).program;

const beatsOf = (texts: Record<string, string>) => {
  const program = compileProject(texts);
  expect(program.chunks).toBeDefined();
  const run = quiet(() => storyRun(new ProgramStory(program.chunks!)));
  return { beats: run.beats.map((beat) => beat.text), errors: run.errors };
};

/** Every diagnostic of `program` with `message`, as the uri and line it is
 *  reported at. */
const reported = (
  program: ReturnType<typeof compileProject>,
  message: string,
): [string, number][] =>
  Object.entries(program.diagnostics ?? {}).flatMap(([uri, diagnostics]) =>
    diagnostics
      .filter(
        (d) =>
          (typeof d.message === "string" ? d.message : d.message.value) ===
          message,
      )
      .map((d): [string, number] => [uri, d.range.start.line]),
  );

describe("a project folder", () => {
  const project = {
    [MAIN]: lines("-> act1"),
    [ACT1]: lines("scene act1", "  The forest is {visited_forest}.", "  done", "end"),
    [DEFS]: lines("store visited_forest = false"),
    // A sub-project: its main script and everything under it are its own.
    [`${ROOT}minigame/main.sd`]: lines("Minigame.", "scene act1", "  Other.", "end"),
    [`${ROOT}minigame/levels/one.sd`]: lines("Level one."),
    // Skipped names.
    [`${ROOT}.hidden/draft.sd`]: lines("Draft.", "scene act1", "  Draft.", "end"),
    [`${ROOT}node_modules/pkg/lib.sd`]: lines("Library.", "scene act1", "  Library.", "end"),
  };

  it("compiles every script under the main script's folder as one program, with no include line", () => {
    const program = compileProject(project);
    expect(errorsOf(program)).toEqual([]);
    expect(Object.keys(program.scripts)).toEqual([MAIN, ACT1, DEFS]);
    const shown = beatsOf(project);
    expect(shown.errors).toEqual([]);
    expect(shown.beats).toEqual(["The forest is false.\n"]);
  });

  it("leaves a sub-project, a dot folder and node_modules out of the project", () => {
    const program = compileProject(project);
    for (const uri of Object.keys(project)) {
      if (![MAIN, ACT1, DEFS].includes(uri)) {
        expect(program.scripts[uri]).toBeUndefined();
        expect(program.diagnostics?.[uri] ?? []).toEqual([]);
      }
    }
  });

  it("reads only .sd files as its scripts, whatever else a host registers as one", () => {
    // The Luau file a `run` reads, registered as a script, is run where the
    // line stands and is not also read as a script of the project.
    const program = compileProject({
      [MAIN]: lines('run "helper"', "Main {x}."),
      [`${ROOT}helper.luau`]: lines("x = 1"),
    });
    expect(errorsOf(program)).toEqual([]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Main 1.\n"]);
  });

  it("makes a sub-project's main script the root of its own program", () => {
    const program = compileProject(project, `${ROOT}minigame/main.sd`);
    expect(Object.keys(program.scripts)).toEqual([
      `${ROOT}minigame/main.sd`,
      `${ROOT}minigame/levels/one.sd`,
    ]);
    expect(reported(program, OUTSIDE_SCENE)).toEqual([
      [`${ROOT}minigame/levels/one.sd`, 0],
    ]);
  });
});

describe("a script other than main", () => {
  const LIB = `${ROOT}lib.sd`;

  it("reports a display line, a top-level local and a run at their lines, and drops them", () => {
    const program = compileProject({
      [MAIN]: lines("Main.", "-> intro"),
      [LIB]: lines(
        "The hero waits.",
        "local count = 1",
        "run helpers",
        "",
        "scene intro",
        "  The intro.",
        "end",
      ),
    });
    expect(reported(program, OUTSIDE_SCENE)).toEqual([
      [LIB, 0],
      [LIB, 1],
      [LIB, 2],
    ]);
    expect(errorsOf(program).map(([, message]) => message)).toEqual([
      OUTSIDE_SCENE,
      OUTSIDE_SCENE,
      OUTSIDE_SCENE,
    ]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Main.\n", "The intro.\n"]);
  });

  it("declares scenes, branches, functions, defines, constants, stores, externals and types without a report", () => {
    const program = compileProject({
      [MAIN]: lines("-> intro"),
      [LIB]: lines(
        "scene intro",
        "  The intro {twice(LIMIT)} {gold}.",
        "  -> .more",
        "  branch more",
        "    More.",
        "  end",
        "end",
        "",
        "function twice(n)",
        "  return n * 2",
        "end",
        "",
        "define hero as character with",
        '  name = "Hero"',
        "end",
        "",
        "const LIMIT = 3",
        "store gold = 4",
        "type Point = { x: number, y: number }",
      ),
    });
    expect(errorsOf(program)).toEqual([]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.errors).toEqual([]);
    expect(shown.beats.map((beat) => beat.text)).toEqual(["The intro 6 4.\n", "More.\n"]);
  });

  it("reports a top-level local function, and not a function whose body declares a local", () => {
    const program = compileProject({
      [MAIN]: lines("Main {twice(2)}."),
      [LIB]: lines(
        "local function helper() return 1 end",
        "@native local function fast() return 2 end",
        "function twice(n)",
        "  local doubled = n * 2",
        "  return doubled",
        "end",
        "@native function thrice(n)",
        "  local tripled = n * 3",
        "  return tripled",
        "end",
      ),
    });
    expect(reported(program, OUTSIDE_SCENE)).toEqual([
      [LIB, 0],
      [LIB, 1],
    ]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Main 4.\n"]);
  });

  it("declares an external without a report of its own", () => {
    // The program engine does not run an external wherever it is declared,
    // which its own error says; it is a declaration all the same.
    const external = (uri: string) =>
      errorsOf(compileProject({ [MAIN]: lines("Main."), [uri]: lines("external host_record(v)") }));
    expect(external(LIB).map(([, message]) => message)).not.toContain(OUTSIDE_SCENE);
    expect(external(LIB)).toEqual(errorsOf(compileProject({ [MAIN]: lines("external host_record(v)", "Main.") })));
  });
});

describe("an include line", () => {
  it("reports that the project's scripts are already part of the story, and includes nothing", () => {
    const program = compileProject({
      [MAIN]: lines("include scripts/defs.sd", "-> act1"),
      [ACT1]: lines("scene act1", "  The forest is {visited_forest}.", "end"),
      [DEFS]: lines("store visited_forest = true"),
    });
    expect(errorsOf(program)).toEqual([[0, INCLUDE_LINE]]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["The forest is true.\n"]);
  });

  it("reports in a script other than main once, as an include line", () => {
    const program = compileProject({
      [MAIN]: lines("Main."),
      [DEFS]: lines("include chapters/act1.sd"),
    });
    expect(errorsOf(program)).toEqual([[0, INCLUDE_LINE]]);
  });
});

describe("declaration order", () => {
  it("reports a layout declared in two scripts, naming both", () => {
    const UI = `${ROOT}scripts/ui.sd`;
    const program = compileProject({
      [MAIN]: lines("layout hud with", '  text "Main"', "end", "Main."),
      [UI]: lines("layout hud with", '  text "UI"', "end"),
    });
    const errors = Object.entries(program.diagnostics ?? {}).flatMap(
      ([uri, diagnostics]) =>
        diagnostics
          .filter((d) => d.severity === 1)
          .map((d) => [
            uri,
            d.range.start.line,
            typeof d.message === "string" ? d.message : d.message.value,
          ]),
    );
    expect(errors).toHaveLength(2);
    expect(errors.map(([uri, line]) => [uri, line])).toEqual([
      [MAIN, 0],
      [UI, 0],
    ]);
    for (const [, , message] of errors) {
      expect(message).toContain("main.sd");
      expect(message).toContain("scripts/ui.sd");
    }
  });

  it("keeps a layout declared twice in one script as the later declaration, with no report", () => {
    const program = compileProject({
      [MAIN]: lines(
        "layout hud with",
        '  text "First"',
        "end",
        "layout hud with",
        '  text "Second"',
        "end",
        "Main.",
      ),
    });
    expect(errorsOf(program)).toEqual([]);
  });

  it("initializes main's globals before another script's, so a store there can read one of main's", () => {
    const program = compileProject({
      [MAIN]: lines("store a = 1", "Main {a} {b} {c}.", "choose", "  * Pick", "    Picked {b}.", "end"),
      [`${ROOT}scripts/b.sd`]: lines("store c = b + 1"),
      [`${ROOT}scripts/a.sd`]: lines("store b = a + 1"),
    });
    expect(errorsOf(program)).toEqual([]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!), [0]));
    expect(shown.errors).toEqual([]);
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Main 1 2 3.\n", "Pick\n", "Picked 2.\n"]);
  });

  it("registers main's declarations first and then each script's by path", () => {
    const program = compileProject({
      [MAIN]: lines("layout zeta with", '  text "Z"', "end", "Main."),
      [`${ROOT}scripts/b.sd`]: lines("layout beta with", '  text "B"', "end"),
      [`${ROOT}scripts/a.sd`]: lines("layout alpha with", '  text "A"', "end"),
    });
    expect(errorsOf(program)).toEqual([]);
    expect(
      Object.keys(program.sparkle?.layouts ?? {}).filter((name) =>
        ["zeta", "alpha", "beta"].includes(name),
      ),
    ).toEqual(["zeta", "alpha", "beta"]);
  });
});
