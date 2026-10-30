import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { testCompiler, testStory } from "../engineUnderTest";
import { programContent } from "../programListing";

const MAIN_URI = "file://proj/main.sd";

const file = (uri: string, text: string, version: number): File => ({
  uri,
  type: "script",
  name: uri.split("/").at(-1)!.split(".")[0]!,
  ext: "sd",
  text,
  version,
  languageId: "sparkdown",
});

function posAt(text: string, offset: number) {
  const lines = text.slice(0, offset).split("\n");
  return { line: lines.length - 1, character: lines.at(-1)!.length };
}

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

type Project = Record<string, string>;

const uriOf = (name: string) => `file://proj/${name}.sd`;

function configure(compiler: SparkdownCompiler, project: Project, version: number) {
  compiler.configure({
    files: Object.entries(project).map(([name, text]) => file(uriOf(name), text, version)),
  });
}

function compileOnce(project: Project) {
  return quiet(() => {
    const compiler = testCompiler();
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

function play(program: any, scene?: string): string {
  const story = testStory(program.chunks);
  if (scene) {
    story.ChoosePathString(scene);
  }
  let text = "";
  for (let guard = 0; guard < 100; guard++) {
    while (story.canContinue) {
      text += story.Continue();
    }
    if (story.currentChoices.length === 0) {
      break;
    }
    story.ChooseChoiceIndex(0);
  }
  return text;
}

const count = (text: string, part: string) => text.split(part).length - 1;

const threeScripts = (shared: string, mainBody: string[] = ["  Main."]): Project => ({
  main: ["scene start", "end", "", "scene main_one", ...mainBody, "end", ""].join("\n"),
  chapter: ["scene chapter_one", "  Chapter.", "end", ""].join("\n"),
  shared,
});

describe("a script of a project of three scripts", () => {
  it("declares its scene once", () => {
    const program = compileOnce(threeScripts(["scene shared_scene", "  Shared.", "end", ""].join("\n")));
    expect(errors(program)).toEqual([]);
    expect(program.chunks).toBeDefined();
    expect(count(play(program, "shared_scene"), "Shared.")).toBe(1);
  });

  it("declares its function once", () => {
    const program = compileOnce(
      threeScripts(["function shared_helper()", "  return 7", "end", ""].join("\n"), ["  Value {shared_helper()}."]),
    );
    expect(errors(program)).toEqual([]);
    expect(play(program, "main_one")).toContain("Value 7.");
  });

  it("declares its anonymous function once", () => {
    const program = compileOnce(
      threeScripts(["store shared_fn = function() return 8 end", ""].join("\n"), ["  Value {shared_fn()}."]),
    );
    expect(errors(program)).toEqual([]);
    expect(play(program, "main_one")).toContain("Value 8.");
  });

  it("declares its layout's binding evaluators once", () => {
    const program = compileOnce(
      threeScripts(["store a = 1", "", "layout la with", '  text "{a}"', "end", ""].join("\n")),
    );
    expect(errors(program)).toEqual([]);
    const id = JSON.stringify(program.sparkle?.layouts?.["la"]).match(/__binding\$\w+/)?.[0];
    expect(id).toBeDefined();
    expect(testStory(program.chunks).EvaluateFunction(id!)).toBe(1);
  });


  it.each([
    ["the entry script", "main", "  Value {shared_helper()}.", "  Value {shared_helper()}, again."],
    ["another script", "chapter", "  Chapter.", "  Chapter, now a good deal longer."],
    ["the script itself", "shared", "  Shared.", "  Shared, now a good deal longer."],
  ])("compiles incrementally as it does cold after an edit to %s", (_, name, find, replace) => {
    const project = threeScripts(
      ["scene shared_scene", "  Shared.", "end", "", "function shared_helper()", "  return 7", "end", ""].join("\n"),
      ["  Value {shared_helper()}."],
    );
    const text = project[name]!;
    const offset = text.indexOf(find);
    expect(offset).toBeGreaterThanOrEqual(0);
    const edited = { ...project, [name]: text.slice(0, offset) + replace + text.slice(offset + find.length) };
    const [incremental, cold] = quiet(() => {
      const compiler = testCompiler();
      configure(compiler, project, 1);
      compiler.compile({ textDocument: { uri: MAIN_URI } });
      compiler.updateDocument({
        textDocument: { uri: uriOf(name), version: 2 },
        contentChanges: [
          {
            range: { start: posAt(text, offset), end: posAt(text, offset + find.length) },
            text: replace,
          },
        ],
      });
      const incremental = compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
      const fresh = testCompiler();
      configure(fresh, edited, 2);
      return [incremental, fresh.compile({ textDocument: { uri: MAIN_URI } }).program];
    });
    expect(errors(incremental)).toEqual([]);
    expect(errors(cold)).toEqual([]);
    expect(programContent(incremental.chunks)).toEqual(programContent(cold.chunks));
    expect(play(incremental, "main_one")).toContain("Value 7");
  });
});

describe("a Luau file that main runs twice", () => {
  const luau = (name: string, text: string): File => ({
    uri: `file://proj/${name}.luau`,
    type: "script",
    name,
    ext: "luau",
    text,
    version: 1,
    languageId: "luau",
  });

  function compileWithLuau(project: Project, files: File[]) {
    return quiet(() => {
      const compiler = testCompiler();
      compiler.configure({
        files: [...Object.entries(project).map(([name, text]) => file(uriOf(name), text, 1)), ...files],
      });
      return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
    });
  }

  it("is declared once and runs once for each of its lines", () => {
    const program = compileWithLuau(
      { main: ["store n = 0", "run bump", "run bump", "scene start", "  Main {n}.", "end", ""].join("\n") },
      [luau("bump", "n += 1\n")],
    );
    expect(errors(program)).toEqual([]);
    expect(play(program)).toBe("Main 2.\n");
  });

  it("is declared once and runs once for its line in main's top level and once for its line in a scene of main", () => {
    const program = compileWithLuau(
      {
        main: [
          "store n = 0",
          "run bump",
          "",
          "scene start",
          "  run bump",
          "  Scene {n}.",
          "end",
          "",
        ].join("\n"),
      },
      [luau("bump", "n += 1\n")],
    );
    expect(errors(program)).toEqual([]);
    expect(play(program)).toBe("Scene 2.\n");
  });

  it("runs where each of its lines stands", () => {
    const program = compileWithLuau(
      {
        main: [
          "store n = 0",
          "scene start",
          "  run bump",
          "  After one {n}.",
          "  run bump",
          "  After two {n}.",
          "end",
          "",
        ].join("\n"),
      },
      [luau("bump", "n += 1\n")],
    );
    expect(errors(program)).toEqual([]);
    expect(play(program)).toBe("After one 1.\nAfter two 2.\n");
  });

  it("runs where its line stands in main's top level and where it stands in a scene of main", () => {
    const program = compileWithLuau(
      {
        main: [
          "store n = 0",
          "run bump",
          "",
          "scene start",
          "  Top {n}.",
          "  -> main_one",
          "end",
          "",
          "scene main_one",
          "  run bump",
          "  Scene {n}.",
          "end",
          "",
        ].join("\n"),
      },
      [luau("bump", "n += 1\n")],
    );
    expect(errors(program)).toEqual([]);
    expect(play(program)).toBe("Top 1.\nScene 2.\n");
  });
});

const INCLUDE_LINE = "Scripts in the project folder are part of the story. Delete this line.";

const errorLines = (program: any): [string, number, string][] =>
  Object.entries(program.diagnostics ?? {}).flatMap(([uri, list]: [string, any]) =>
    list
      .filter((d: any) => d.severity === 1)
      .map((d: any) => [uri, d.range.start.line, typeof d.message === "string" ? d.message : d.message?.value]),
  );

describe("a script with an include line of the script that would include it", () => {
  it("reports the include line, and each script's scene is declared once", () => {
    const program = compileOnce({
      main: ["include chapter.sd", "", "scene start", "end", "", "scene main_one", "  Main.", "end", ""].join("\n"),
      chapter: ["include main.sd", "", "scene chapter_one", "  Chapter.", "end", ""].join("\n"),
    });
    expect(errorLines(program)).toEqual([
      [MAIN_URI, 0, INCLUDE_LINE],
      [uriOf("chapter"), 0, INCLUDE_LINE],
    ]);
    expect(play(program, "main_one")).toContain("Main.");
    expect(play(program, "chapter_one")).toContain("Chapter.");
  });
});

describe("an include line", () => {
  const main = ["scene start", "  Opening.", "end", "include nope.sd", "", "scene main_one", "  Main.", "end", ""].join(
    "\n",
  );
  const atInclude: [string, number, string] = [MAIN_URI, 3, INCLUDE_LINE];

  it("is an error at the include", () => {
    expect(errorLines(compileOnce({ main }))).toEqual([atInclude]);
  });

  it("is an error at the include after an edit elsewhere", () => {
    const program = quiet(() => {
      const compiler = testCompiler();
      configure(compiler, { main }, 1);
      compiler.compile({ textDocument: { uri: MAIN_URI } });
      const at = main.indexOf("Main.");
      compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version: 2 },
        contentChanges: [{ range: { start: posAt(main, at), end: posAt(main, at + 5) }, text: "Main, edited." }],
      });
      return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
    });
    expect(errorLines(program)).toEqual([atInclude]);
  });

  it.each(["include", "include  # tag"])("is an error at `%s`, which names no script", (line) => {
    const text = main.replace("include nope.sd", line);
    expect(errorLines(compileOnce({ main: text }))).toEqual([atInclude]);
  });
});
