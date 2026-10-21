// A project is a folder (#1387, Feature #1386): every `.sd` script under the
// folder of the script a compile starts from is part of its story, with no
// include line. A subfolder holding its own main script is a project of its
// own, and a folder named `node_modules` or whose name begins with `.` is in
// no project. The script the compile starts from runs its top-level lines;
// every other script holds declarations only, which register main first and
// then by path.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { SparkdownCompilerConfig } from "../../compiler/types/SparkdownCompilerConfig";
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

const compileProject = (
  texts: Record<string, string>,
  entry = MAIN,
  config: SparkdownCompilerConfig = {},
) => quiet(() => programCompiler(texts, config).compile(entry)).program;

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

  it("reads a script whose file name holds # or %, as the web editor names an imported file", () => {
    // The web editor's URI is its path as written (`getUriFromPath`), so a
    // `#` is part of the name and `%2e` is three characters, not a dot.
    const HASH = `${ROOT}scripts/act#1.sd`;
    const PERCENT = `${ROOT}scripts/%2eact2.sd`;
    const project = {
      [MAIN]: lines("-> act1"),
      [HASH]: lines("scene act1", "  First.", "  -> act2", "end"),
      [PERCENT]: lines("scene act2", "  Second.", "  done", "end"),
    };
    const program = compileProject(project, MAIN, { uriPathsAsWritten: true });
    expect(errorsOf(program)).toEqual([]);
    expect(Object.keys(program.scripts)).toEqual([MAIN, PERCENT, HASH]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["First.\n", "Second.\n"]);
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

  it("declares with a store, const or function marked with &, and reports a & statement that runs", () => {
    const program = compileProject({
      [MAIN]: lines("Gold {gold} {twice(LIMIT)}."),
      [LIB]: lines(
        "& store gold = 4",
        "& const LIMIT = 3",
        "& function twice(n) return n * 2 end",
        "& gold = 5",
        "& print(gold)",
        "& local copper = 1",
      ),
    });
    expect(reported(program, OUTSIDE_SCENE)).toEqual([
      [LIB, 3],
      [LIB, 4],
      [LIB, 5],
    ]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Gold 4 6.\n"]);
  });

  it("reports a & line that declares and then runs something after the declaration", () => {
    const program = compileProject({
      [MAIN]: lines("Silver {silver}."),
      [LIB]: lines(
        "& store gold = 4; gold = 5",
        "& function f() end; gold = 6",
        "store silver = 2",
      ),
    });
    expect(reported(program, OUTSIDE_SCENE)).toEqual([
      [LIB, 0],
      [LIB, 1],
    ]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Silver 2.\n"]);
  });

  it("declares with a & line that ends in a comment", () => {
    const program = compileProject({
      [MAIN]: lines("Gold {gold} {f()}."),
      [LIB]: lines("& store gold = 4; -- the gold", "& function f() return 4 end; --[[ four ]]"),
    });
    expect(errorsOf(program)).toEqual([]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Gold 4 4.\n"]);
  });

  it("declares a member or method function, marked or not, for main to call", () => {
    const program = compileProject({
      [MAIN]: lines("store api = {}", "-> s", "scene s", "  Answer {api.f()} {api.g()} {api:h()} {api.k()}.", "end"),
      [LIB]: lines(
        "function api.f() return 3 end",
        "& function api.g() return 4 end",
        "function api:h() return 5 end",
        "function api.k()",
        "  local six = 6",
        "  return six",
        "end",
      ),
    });
    expect(errorsOf(program)).toEqual([]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.errors).toEqual([]);
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Answer 3 4 5 6.\n"]);
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
    // The first declaration stands in the reactive tree and the static
    // definition alike.
    expect(JSON.stringify(program.sparkle?.layouts?.["hud"])).toContain("Main");
    expect(JSON.stringify(program.sparkle?.layouts?.["hud"])).not.toContain("UI");
    expect(JSON.stringify(program.context?.["layout"]?.["hud"])).toContain("Main");
    expect(JSON.stringify(program.context?.["layout"]?.["hud"])).not.toContain("UI");
  });

  it("reports a component declared in two scripts, and keeps the first in both its definitions", () => {
    const UI = `${ROOT}scripts/ui.sd`;
    const program = compileProject({
      [MAIN]: lines("component badge with", '  text "Main"', "end", "Main."),
      [UI]: lines("component badge with", '  text "UI"', "end"),
    });
    expect(reported(program, `Component \`badge\` is declared in main.sd and in scripts/ui.sd. Declare it in one script.`)).toEqual([
      [MAIN, 0],
      [UI, 0],
    ]);
    expect(JSON.stringify(program.sparkle?.components?.["badge"])).toContain("Main");
    expect(JSON.stringify(program.sparkle?.components?.["badge"])).not.toContain("UI");
    expect(JSON.stringify(program.context?.["component"]?.["badge"])).toContain("Main");
    expect(JSON.stringify(program.context?.["component"]?.["badge"])).not.toContain("UI");
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

  // How each host spells the URI of the same file: VS Code percent-encodes a
  // URI's path, and the web editor writes the path as it is
  // (`uriPathsAsWritten`). Each file is ordered by its name, as the file
  // system names it, either way.
  const hosts = {
    "VS Code": {},
    "the web editor": { uriPathsAsWritten: true },
  } as const;
  const spellings: { file: string; host: keyof typeof hosts; spelled: string; before: boolean }[] = [
    { file: "é.sd", host: "VS Code", spelled: "%C3%A9.sd", before: false },
    { file: "é.sd", host: "the web editor", spelled: "é.sd", before: false },
    { file: "%C3%A9.sd", host: "VS Code", spelled: "%25C3%25A9.sd", before: true },
    { file: "%C3%A9.sd", host: "the web editor", spelled: "%C3%A9.sd", before: true },
    { file: "%7A.sd", host: "VS Code", spelled: "%257A.sd", before: true },
    { file: "%7A.sd", host: "the web editor", spelled: "%7A.sd", before: true },
  ];

  it.each(spellings)("orders $file, as $host spells it, by its name beside scripts/a.sd", ({ host, spelled, before }) => {
    // `scripts/a.sd` and the other file each declare a store that reads the
    // store of whichever comes first.
    const other = `${ROOT}scripts/${spelled}`;
    const A = `${ROOT}scripts/a.sd`;
    const program = compileProject(
      {
        [MAIN]: lines("Main {first} {second}."),
        [before ? other : A]: lines("store first = 1"),
        [before ? A : other]: lines("store second = first + 1"),
      },
      MAIN,
      hosts[host],
    );
    expect(errorsOf(program)).toEqual([]);
    expect(Object.keys(program.scripts)).toEqual(before ? [MAIN, other, A] : [MAIN, A, other]);
    const shown = quiet(() => storyRun(new ProgramStory(program.chunks!)));
    expect(shown.beats.map((beat) => beat.text)).toEqual(["Main 1 2.\n"]);
  });

  it.each([
    { file: "act#1.sd", host: "the web editor" as const, spelled: "act#1.sd" },
    { file: "act#1.sd", host: "VS Code" as const, spelled: "act%231.sd" },
    { file: "%23.sd", host: "the web editor" as const, spelled: "%23.sd" },
    { file: "%23.sd", host: "VS Code" as const, spelled: "%2523.sd" },
  ])("names a colliding $file, as $host spells it, by its name", ({ file, host, spelled }) => {
    const other = `${ROOT}scripts/${spelled}`;
    const program = compileProject(
      {
        [MAIN]: lines("layout hud with", '  text "Main"', "end", "Main."),
        [other]: lines("layout hud with", '  text "Other"', "end"),
      },
      MAIN,
      hosts[host],
    );
    const message = `Layout \`hud\` is declared in main.sd and in scripts/${file}. Declare it in one script.`;
    expect(reported(program, message)).toEqual([
      [MAIN, 0],
      [other, 0],
    ]);
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
