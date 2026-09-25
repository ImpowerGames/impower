// A synthetic name minted from a source offset must come out of an
// incremental compile as a cold compile of the same text names it. Two ways a
// carried node could keep a different name: a script included from two places
// is walked twice by the compiler's renaming pass, and a Sparkle layout's
// binding evaluators are named by offset.
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

type Compiled = {
  // The program and its Sparkle trees.
  text: string;
  sparkle: any;
  // The `span` of each binding handle from `main.sd`, in serialization order.
  spans: { line: number; from: number; to: number }[];
};

function compiled(compiler: SparkdownCompiler): Compiled {
  const { program } = compiler.compile({ textDocument: { uri: MAIN_URI } });
  const spans: Compiled["spans"] = [];
  const text = JSON.stringify(
    { compiled: program.compiled, sparkle: program.sparkle },
    function (this: any, key, value) {
      if (key === "span" && this && typeof this.exprId === "string" && value.file === MAIN_URI) {
        spans.push({ line: value.line, from: value.from, to: value.to });
      }
      return value;
    },
  );
  return { text, sparkle: program.sparkle, spans };
}

// Compiles `project`, inserts `insert` into the file `name` at `offset`, and
// returns the compile before the edit, the incremental compile of the edited
// project and a cold compile of it.
function incrementalAndCold(project: Project, name: string, offset: number, insert: string): [Compiled, Compiled, Compiled] {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    configure(compiler, project, 1);
    const before = compiled(compiler);
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
    return [before, incremental, compiled(fresh)];
  });
}

function compileOnce(main: string, others: Project = {}) {
  return quiet(() => {
    const compiler = new SparkdownCompiler();
    configure(compiler, { main, ...others }, 1);
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

function diagnostics(program: any): string[] {
  return Object.values(program.diagnostics ?? {}).flatMap((list: any) =>
    list.map((d: any) => (typeof d.message === "string" ? d.message : (d.message?.value ?? ""))),
  );
}

// The value the evaluator behind a layout's first binding returns.
function firstBindingValue(program: any, layout: string): unknown {
  const id = JSON.stringify(program.sparkle?.layouts?.[layout]).match(/__binding_\w+/)?.[0];
  expect(id).toBeDefined();
  const story = new RuntimeStory(program.compiled as Record<string, any>);
  return story.EvaluateFunction(id!);
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
    const [, incremental, cold] = incrementalAndCold(project, "pre", pre.length, "& r = a:add(5):add(6)\n");
    expect(incremental.text).toContain("__synth_");
    expect(incremental.text).toBe(cold.text);
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
    const [before, incremental, cold] = incrementalAndCold(project, "main", at, "Longer ");
    // The layout's tree is the one the first compile lowered, so its chunk was
    // carried and not lowered again.
    expect(incremental.sparkle.layouts.la).toBe(before.sparkle.layouts.la);
    expect(incremental.spans).toEqual(cold.spans);
    expect(incremental.spans).toHaveLength(1);
    expect(incremental.text).toContain("__binding_");
    expect(incremental.text).toBe(cold.text);
  });

  it("a carried layout's span follows each of several edits above it", () => {
    let text = [
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
    ].join("\n");
    const spanOf = (source: string) => {
      const from = source.indexOf("{a}");
      return { line: posAt(source, from).line, from, to: from + "{a}".length };
    };
    quiet(() => {
      const compiler = new SparkdownCompiler();
      configure(compiler, { main: text }, 1);
      const first = compiled(compiler);
      expect(first.spans).toEqual([spanOf(text)]);
      // Lengthen a line, add a line, then remove what was added: the carried
      // layout moves down twice and then back up.
      const edits: [number, number, string][] = [
        [text.indexOf("  First line.") + 2, 0, "Longer "],
        [text.indexOf("  Second line.") + 2 + "Longer ".length, 0, "Added line.\n  "],
        [text.indexOf("  Second line.") + 2 + "Longer ".length, "Added line.\n  ".length, ""],
      ];
      for (const [index, [offset, removed, insert]] of edits.entries()) {
        const start = posAt(text, offset);
        const end = posAt(text, offset + removed);
        compiler.updateDocument({
          textDocument: { uri: MAIN_URI, version: index + 2 },
          contentChanges: [{ range: { start, end }, text: insert }],
        });
        text = text.slice(0, offset) + insert + text.slice(offset + removed);
        const incremental = compiled(compiler);
        expect(incremental.sparkle.layouts.la).toBe(first.sparkle.layouts.la);
        expect(incremental.spans).toEqual([spanOf(text)]);
      }
    });
  });

  it("a match with no condition keeps its empty placeholder span", () => {
    const main = ["store a = 1", "", "scene one", "  First line.", "end", "", "layout la with", "  match do", "    case 1", '      text "{a}"', "  end", "end", ""].join("\n");
    const program = compileOnce(main);
    const placeholders: unknown[] = [];
    JSON.stringify(program.sparkle, function (this: any, key, value) {
      if (key === "span" && this?.exprId === "") placeholders.push(value);
      return value;
    });
    expect(placeholders).toEqual([{ line: 0, from: 0, to: 0 }]);
  });

  it("a binding handle's span gives its position in the document", () => {
    const main = ["store a = 1", "", "scene one", "  First line.", "end", "", "layout la with", '  text "{a}"', "end", ""].join("\n");
    const [before, incremental, cold] = incrementalAndCold({ main }, "main", main.indexOf("  First line.") + 2, "Longer ");
    const at = (text: string) => {
      const from = text.indexOf("{a}");
      return { line: posAt(text, from).line, from, to: from + "{a}".length };
    };
    expect(before.spans).toEqual([at(main)]);
    const edited = main.replace("First line.", "Longer First line.");
    expect(cold.spans).toEqual([at(edited)]);
    expect(incremental.spans).toEqual(cold.spans);
  });
});

describe("binding evaluator names", () => {
  it("two layouts of one file get an evaluator each", () => {
    // Each binding sits at the same place within its own layout, and the two
    // chunks hash alike under 32-bit FNV-1a, so a name taken from a hash of
    // the chunk's text would give both layouts one evaluator.
    const program = compileOnce(
      [
        "store a = 1",
        "store b = 2",
        "",
        "layout la with",
        '  text "{a}"',
        '  text "A03cka"',
        "end",
        "",
        "layout lb with",
        '  text "{b}"',
        '  text "B05101"',
        "end",
        "",
      ].join("\n"),
    );
    expect(diagnostics(program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
    expect(firstBindingValue(program, "la")).toBe(1);
    expect(firstBindingValue(program, "lb")).toBe(2);
  });

  it("a layout declared twice in one file compiles, and the later one is kept", () => {
    const copy = ["layout la with", '  text "{a}"', "end", ""];
    const identical = compileOnce(["store a = 1", "", ...copy, ...copy].join("\n"));
    expect(diagnostics(identical).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
    expect(firstBindingValue(identical, "la")).toBe(1);

    const adapted = compileOnce(
      ["store a = 1", "store b = 2", "", ...copy, "layout la with", '  text "{b}"', "end", ""].join("\n"),
    );
    expect(diagnostics(adapted).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
    expect(firstBindingValue(adapted, "la")).toBe(2);
  });

  it("a layout declared in two files compiles, and the later one is kept", () => {
    // The two paths hash alike under 32-bit FNV-1a, so a name taken from a
    // hash of the path would give both files' bindings one evaluator.
    const program = compileOnce(["store a = 1", "store b = 2", "include f19349.sd", "include f1238112.sd", ""].join("\n"), {
      f19349: ["layout shared with", '  text "{a}"', "end", ""].join("\n"),
      f1238112: ["", "", "layout shared with", '  text "{b}"', "end", ""].join("\n"),
    });
    expect(diagnostics(program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
    expect(firstBindingValue(program, "shared")).toBe(2);
  });
});
