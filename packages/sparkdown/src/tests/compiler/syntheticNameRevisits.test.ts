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

type Compiled = {
  text: string;
  sparkle: any;
  spans: { line: number; from: number; to: number }[];
  scripts: string[];
};

function compiled(compiler: SparkdownCompiler): Compiled {
  const { program } = compiler.compile({ textDocument: { uri: MAIN_URI } });
  const spans: Compiled["spans"] = [];
  const text = JSON.stringify(
    {
      compiled: programContent(program.chunks),
      sparkle: program.sparkle,
    },
    function (this: any, key, value) {
      if (key === "span" && this && typeof this.exprId === "string" && value.file === MAIN_URI) {
        spans.push({ line: value.line, from: value.from, to: value.to });
      }
      return value;
    },
  );
  return { text, sparkle: program.sparkle, spans, scripts: Object.keys(program.scripts) };
}

function incrementalAndCold(project: Project, name: string, offset: number, insert: string): [Compiled, Compiled, Compiled] {
  return quiet(() => {
    const compiler = testCompiler();
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
    const fresh = testCompiler();
    configure(fresh, edited, 2);
    return [before, incremental, compiled(fresh)];
  });
}

function compileOnce(main: string, others: Project = {}) {
  return quiet(() => {
    const compiler = testCompiler();
    configure(compiler, { main, ...others }, 1);
    return compiler.compile({ textDocument: { uri: MAIN_URI } }).program;
  });
}

function diagnostics(program: any): string[] {
  return Object.values(program.diagnostics ?? {}).flatMap((list: any) =>
    list.map((d: any) => (typeof d.message === "string" ? d.message : (d.message?.value ?? ""))),
  );
}

function firstBindingValue(program: any, layout: string): unknown {
  const id = JSON.stringify(program.sparkle?.layouts?.[layout]).match(/__binding\$\w+/)?.[0];
  expect(id).toBeDefined();
  const story = testStory(program.chunks);
  return story.EvaluateFunction(id!);
}

describe("synthetic names after an edit", () => {
  it("a method-call temp in one of several scripts keeps the cold name", () => {
    const project: Project = {
      main: [
        "store a = { add = function(self, n) return self end }",
        "store r = 0",
        "",
        "scene main_one",
        "  Opening line.",
        "& r = a:add(3):add(4)",
        "-> shared_one",
        "end",
        "",
      ].join("\n"),
      chapter: ["scene chapter_one", "  Chapter line.", "-> shared_one", "end", ""].join("\n"),
      pre: ["scene pre_one", "  Before the shared script.", "end", ""].join("\n"),
      shared: ["scene shared_one", "& r = a:add(1):add(2)", "end", ""].join("\n"),
    };
    const pre = project["pre"]!;
    const [, incremental, cold] = incrementalAndCold(project, "pre", pre.lastIndexOf("end"), "& r = a:add(5):add(6)\n");
    for (const program of [incremental, cold]) {
      expect(program.scripts).toEqual(["main", "chapter", "pre", "shared"].map(uriOf));
    }
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
    const at = project["main"]!.indexOf("  First line.") + 2;
    const [before, incremental, cold] = incrementalAndCold(project, "main", at, "Longer ");
    expect(incremental.sparkle.layouts.la).toBe(before.sparkle.layouts.la);
    expect(incremental.spans).toEqual(cold.spans);
    expect(incremental.spans).toHaveLength(1);
    expect(incremental.text).toContain("__binding$");
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
      const compiler = testCompiler();
      configure(compiler, { main: text }, 1);
      const first = compiled(compiler);
      expect(first.spans).toEqual([spanOf(text)]);
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

  it("layouts declared in two files whose paths hash alike get an evaluator each", () => {
    const program = compileOnce(["store a = 1", "store b = 2", ""].join("\n"), {
      f19349: ["layout shared_a with", '  text "{a}"', "end", ""].join("\n"),
      f1238112: ["", "", "layout shared_b with", '  text "{b}"', "end", ""].join("\n"),
    });
    expect(diagnostics(program).filter((m) => m.includes("Duplicate identifier"))).toEqual([]);
    expect(firstBindingValue(program, "shared_a")).toBe(1);
    expect(firstBindingValue(program, "shared_b")).toBe(2);
  });
});
