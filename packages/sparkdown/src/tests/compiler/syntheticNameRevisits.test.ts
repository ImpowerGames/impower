// A synthetic name minted from a source offset must come out of an
// incremental compile as a cold compile of the same text names it. Two ways a
// carried node could keep a different name: a script included from two places
// is walked twice by the compiler's renaming pass, and a Sparkle layout's
// binding evaluators are named by offset.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { File } from "../../compiler/types/File";

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

// The program and its Sparkle trees. A binding's `span` is left out: a carried
// chunk keeps the source offsets it was lowered at, and nothing reads them.
function compiled(compiler: SparkdownCompiler): string {
  const { program } = compiler.compile({ textDocument: { uri: MAIN_URI } });
  return JSON.stringify({ compiled: program.compiled, sparkle: program.sparkle }, (key, value) =>
    key === "span" ? undefined : value,
  );
}

// Compiles `project`, inserts `insert` into the file `name` at `offset`, and
// returns the incremental compile of the edited project beside a cold compile
// of it.
function incrementalAndCold(project: Project, name: string, offset: number, insert: string): [string, string] {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    configure(compiler, project, 1);
    compiled(compiler);
    const text = project[name]!;
    const at = posAt(text, offset);
    compiler.updateDocument({
      textDocument: { uri: uriOf(name), version: 2 },
      contentChanges: [{ range: { start: at, end: at }, text: insert }],
    });
    const incremental = compiled(compiler);
    const edited = { ...project, [name]: text.slice(0, offset) + insert + text.slice(offset) };
    const fresh = new SparkdownCompiler();
    configure(fresh, edited, 2);
    return [incremental, compiled(fresh)];
  });
}

describe("synthetic names after an edit", () => {
  it("a method-call temp in a script included twice keeps the cold name", () => {
    // `shared.sd` is included by `main.sd` and again by `chapter.sd`.
    const project: Project = {
      main: [
        "store a = { add = function(self, n) return self end }",
        "store r = 0",
        "include pre.sd",
        "include shared.sd",
        "include chapter.sd",
        "",
        "scene main_one",
        "  Opening line.",
        "& r = a:add(3):add(4)",
        "end",
        "",
      ].join("\n"),
      chapter: ["include shared.sd", "", "scene chapter_one", "  Chapter line.", "end", ""].join("\n"),
      pre: ["  Before the shared script.", ""].join("\n"),
      shared: ["& r = a:add(1):add(2)", ""].join("\n"),
    };
    // A temp in the script included first numbers ahead of the shared temps,
    // so every carried canonical name moves up. It goes after the line already
    // there, so its offsets differ from the shared temps' offsets.
    const pre = project["pre"]!;
    const [incremental, cold] = incrementalAndCold(project, "pre", pre.length, "& r = a:add(5):add(6)\n");
    expect(incremental).toContain("__synth_");
    expect(incremental).toBe(cold);
  });

  it("a layout binding moved by an edit above it keeps the cold name", () => {
    const project: Project = {
      main: [
        "store a = 1",
        "",
        "scene one",
        "  First line.",
        "end",
        "",
        "scene two",
        "  Second line.",
        "end",
        "",
        "scene three",
        "  Third line.",
        "end",
        "",
        "layout la with",
        '  text "{a}"',
        "end",
        "",
      ].join("\n"),
    };
    // The scenes between keep the layout outside the region the edit
    // reparses, so the incremental compile carries its chunk unlowered.
    const at = project["main"]!.indexOf("  First line.") + 2;
    const [incremental, cold] = incrementalAndCold(project, "main", at, "Longer ");
    expect(incremental).toContain("__binding_");
    expect(incremental).toBe(cold);
  });

  it("two layouts of one file get an evaluator each", () => {
    // Each binding sits at the same place within its own layout.
    const project: Project = {
      main: ["store a = 1", "", "layout la with", '  text "{a}"', "end", "", "layout lb with", '  text "{a}"', "end", ""].join(
        "\n",
      ),
    };
    const { program } = quiet(() => {
      const compiler = new SparkdownCompiler();
      configure(compiler, project, 1);
      return compiler.compile({ textDocument: { uri: MAIN_URI } });
    });
    const ids = (tree: unknown) => JSON.stringify(tree).match(/__binding_\w+/g) ?? [];
    const la = ids(program.sparkle?.layouts?.["la"]);
    const lb = ids(program.sparkle?.layouts?.["lb"]);
    expect(la.length).toBe(1);
    expect(lb.length).toBe(1);
    expect(la[0]).not.toBe(lb[0]);
  });
});
