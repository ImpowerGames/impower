// A script is included once per compile. The first `include` that reaches it
// places its content; a later `include` of the same script, from any file,
// adds nothing, so the flows it declares are declared once.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

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

// Every line the story shows from its start, or from the scene `scene`,
// choosing the first choice whenever it offers any.
function play(program: any, scene?: string): string {
  const story = new RuntimeStory(program.compiled as Record<string, any>);
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

// `shared.sd` is included by `main.sd` and again by `chapter.sd`, which
// `main.sd` includes after it.
const twice = (shared: string, mainBody: string[] = ["  Main."]): Project => ({
  main: ["include shared.sd", "include chapter.sd", "", "scene main_one", ...mainBody, "end", ""].join("\n"),
  chapter: ["include shared.sd", "", "scene chapter_one", "  Chapter.", "end", ""].join("\n"),
  shared,
});

describe("a script included from two places", () => {
  it("declares its scene once", () => {
    const program = compileOnce(twice(["scene shared_scene", "  Shared.", "end", ""].join("\n")));
    expect(errors(program)).toEqual([]);
    expect(program.compiled).toBeDefined();
  });

  it("declares its function once", () => {
    const program = compileOnce(
      twice(["function shared_helper()", "  return 7", "end", ""].join("\n"), ["  Value {shared_helper()}."]),
    );
    expect(errors(program)).toEqual([]);
    expect(play(program, "main_one")).toContain("Value 7.");
  });

  it("declares its anonymous function once", () => {
    const program = compileOnce(
      twice(["store shared_fn = function() return 8 end", ""].join("\n"), ["  Value {shared_fn()}."]),
    );
    expect(errors(program)).toEqual([]);
    expect(play(program, "main_one")).toContain("Value 8.");
  });

  it("declares its layout's binding evaluators once", () => {
    const program = compileOnce(twice(["store a = 1", "", "layout la with", '  text "{a}"', "end", ""].join("\n")));
    expect(errors(program)).toEqual([]);
    const id = JSON.stringify(program.sparkle?.layouts?.["la"]).match(/__binding_\w+/)?.[0];
    expect(id).toBeDefined();
    expect(new RuntimeStory(program.compiled as Record<string, any>).EvaluateFunction(id!)).toBe(1);
  });

  it("shows its display content once, where it is first included", () => {
    const program = compileOnce(twice(["Shared line.", ""].join("\n")));
    expect(errors(program)).toEqual([]);
    const shown = play(program);
    expect(count(shown, "Shared line.")).toBe(1);
  });

  // An edit to the entry script keeps the flows of every other script for
  // reuse, the shared script's among them; an edit to another script
  // rebuilds them all.
  it.each([
    ["the entry script", "main", "  Value {shared_helper()}.", "  Value {shared_helper()}, again."],
    ["the script that includes it second", "chapter", "  Chapter.", "  Chapter, now a good deal longer."],
  ])("compiles incrementally as it does cold after an edit to %s", (_, name, find, replace) => {
    const project = twice(
      ["scene shared_scene", "  Shared.", "end", "", "function shared_helper()", "  return 7", "end", ""].join("\n"),
      ["  Value {shared_helper()}."],
    );
    const text = project[name]!;
    const offset = text.indexOf(find);
    expect(offset).toBeGreaterThanOrEqual(0);
    const edited = { ...project, [name]: text.slice(0, offset) + replace + text.slice(offset + find.length) };
    const [incremental, cold] = quiet(() => {
      const compiler = new SparkdownCompiler();
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
      const fresh = new SparkdownCompiler();
      configure(fresh, edited, 2);
      return [incremental, fresh.compile({ textDocument: { uri: MAIN_URI } }).program];
    });
    expect(errors(incremental)).toEqual([]);
    expect(errors(cold)).toEqual([]);
    expect(JSON.stringify(incremental.compiled)).toBe(JSON.stringify(cold.compiled));
    expect(play(incremental, "main_one")).toContain("Value 7");
  });
});

describe("a script that includes the script including it", () => {
  it("compiles, with each script included once", () => {
    const program = compileOnce({
      main: ["include chapter.sd", "", "scene main_one", "  Main.", "end", ""].join("\n"),
      chapter: ["include main.sd", "", "scene chapter_one", "  Chapter.", "end", ""].join("\n"),
    });
    expect(errors(program)).toEqual([]);
    expect(play(program, "main_one")).toContain("Main.");
    expect(play(program, "chapter_one")).toContain("Chapter.");
  });
});
