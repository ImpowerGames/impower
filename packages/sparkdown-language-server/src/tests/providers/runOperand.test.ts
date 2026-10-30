import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test, vi } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getCodeActions } from "../../utils/providers/getCodeActions";
import { getDocumentLinks } from "../../utils/providers/getDocumentLinks";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";
import { complete } from "./completionHarness";

const ROOT = "file:///proj/";
const MAIN = `${ROOT}main.sd`;
const NEWLINE = String.fromCharCode(10);

const lines = (...text: string[]) => text.join(NEWLINE);

const LUAU = {
  "lib/helpers.luau": "local a = 1",
  "lib/util.luau": "local b = 2",
  "scripts/util.luau": "local c = 3",
  "other/main.sd": lines("scene start", "  done", "end"),
  "other/elsewhere.luau": "local d = 4",
};

const compile = (main: string, files: Record<string, string> = LUAU): SparkProgram => {
  const compiler = new SparkdownCompiler();
  const file = (uri: string, text: string) => {
    const name = uri.split("/").at(-1)!;
    return {
      uri,
      type: "script",
      name: name.split(".")[0]!,
      ext: name.slice(name.lastIndexOf(".") + 1),
      text,
      version: 1,
      languageId: name.endsWith(".luau") ? "luau" : "sparkdown",
    };
  };
  compiler.configure({
    files: [
      file(MAIN, main),
      ...Object.entries(files).map(([path, text]) => file(ROOT + path, text)),
    ] as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return compiler.compile({ textDocument: { uri: MAIN } }).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const errorsOf = (program: SparkProgram, uri = MAIN) =>
  (program.diagnostics?.[uri] ?? []).filter((d) => d.severity === 1);

const fixesOf = (text: string, files?: Record<string, string>) =>
  fixesIn(MAIN, text, compile(text, files));

const fixesIn = (uri: string, text: string, program: SparkProgram) => {
  const document = TextDocument.create(uri, "sparkdown", 1, text);
  return getCodeActions(document, errorsOf(program, uri)).map((action) => ({
    title: action.title,
    preferred: action.isPreferred,
    text: TextDocument.applyEdits(document, action.edit!.changes![uri]!),
  }));
};

describe("the run operand's quick fixes", () => {
  test("quotes an unquoted path, and the quoted path runs the file", () => {
    const fixes = fixesOf(lines("run lib/helpers", "scene start", "  done", "end", ""));
    expect(fixes).toEqual([
      { title: "Quote the path", preferred: true, text: lines('run "lib/helpers"', "scene start", "  done", "end", "") },
    ]);
    expect(errorsOf(compile(fixes[0]!.text))).toEqual([]);
  });

  test("offers the quoted path of each file a shared name names, none preferred", () => {
    const fixes = fixesOf(lines("run util  # tag", "scene start", "  done", "end", ""));
    expect(fixes).toEqual([
      { title: 'Use "lib/util"', preferred: false, text: lines('run "lib/util"  # tag', "scene start", "  done", "end", "") },
      { title: 'Use "scripts/util"', preferred: false, text: lines('run "scripts/util"  # tag', "scene start", "  done", "end", "") },
    ]);
    for (const fix of fixes) {
      expect(errorsOf(compile(fix.text))).toEqual([]);
    }
  });

  test.each([
    ["Helpers", "Change to 'helpers'", "run helpers"],
    ["HELPERS.luau", "Change to 'helpers'", "run helpers"],
    ['"Lib/Helpers"', "Change to 'lib/helpers'", 'run "lib/helpers"'],
    ["'./lib/helpers.LUAU'", "Change to './lib/helpers.luau'", "run './lib/helpers.luau'"],
  ])("corrects an operand that differs only by case in its own form: run %s", (operand, title, fixed) => {
    const fixes = fixesOf(lines(`run ${operand}`, "scene start", "  done", "end", ""));
    expect(fixes).toEqual([{ title, preferred: true, text: lines(fixed, "scene start", "  done", "end", "") }]);
    expect(errorsOf(compile(fixes[0]!.text))).toEqual([]);
  });

  test.each([
    ['run "./lib/helpers', 'run "./lib/helpers"'],
    ["run 'lib/helpers", "run 'lib/helpers'"],
  ])("closes a quote the line never closes: %s", (line, fixed) => {
    const fixes = fixesOf(lines(line, "scene start", "  done", "end", ""));
    expect(fixes).toEqual([
      { title: "Close the quote", preferred: true, text: lines(fixed, "scene start", "  done", "end", "") },
    ]);
    expect(errorsOf(compile(fixes[0]!.text))).toEqual([]);
  });

  test("offers paths relative to the script the run is in, apostrophes and all", () => {
    const CHAPTER = `${ROOT}chapters/chapter.sd`;
    const chapter = (operand: string) =>
      lines("scene chapter", `  run ${operand}`, "  done", "end", "");
    const files = {
      "chapters/chapter.sd": chapter("util"),
      "lib/O'Brien/util.luau": "local a = 1",
      "scripts/util.luau": "local b = 2",
    };
    const fixes = fixesIn(CHAPTER, chapter("util"), compile(lines("scene start", "  -> chapter", "end", ""), files));
    expect(fixes).toEqual([
      {
        title: `Use "../lib/O'Brien/util"`,
        preferred: false,
        text: chapter(`"../lib/O'Brien/util"`),
      },
      { title: 'Use "../scripts/util"', preferred: false, text: chapter('"../scripts/util"') },
    ]);
    for (const fix of fixes) {
      const program = compile(lines("scene start", "  -> chapter", "end", ""), { ...files, "chapters/chapter.sd": fix.text });
      expect(errorsOf(program, CHAPTER)).toEqual([]);
    }
  });

  test("offers nothing for an operand no file is near", () => {
    expect(fixesOf(lines("run missing", "scene start", "  done", "end", ""))).toEqual([]);
    expect(fixesOf(lines('run "missing"', "scene start", "  done", "end", ""))).toEqual([]);
  });
});

const program = {
  uri: MAIN,
  files: Object.fromEntries(
    [MAIN, ...Object.keys(LUAU).map((path) => ROOT + path)].map((uri) => [
      uri,
      { uri, name: "", ext: "", type: "script" },
    ]),
  ),
} as unknown as SparkProgram;

describe("the run operand's completions", () => {
  test("lists the name of each Luau file of the project no other shares", () => {
    const at = complete("run @1", { program });
    expect(at.labels).toEqual(["helpers"]);
    expect(at.detail("helpers")).toBe("Luau file");
  });

  test.each(['run "@1', 'run "@1"', "run 'li@1'", 'run "lib/@1"'])(
    "lists each Luau file's path relative to the script after a quote: %s",
    (source) => {
      expect(complete(source, { program }).labels.sort()).toEqual([
        "lib/helpers",
        "lib/util",
        "scripts/util",
      ]);
    },
  );

  test("replaces what is typed of the operand", () => {
    const item = complete('run "lib/he@1"', { program }).items.find(
      (i) => i.label === "lib/helpers",
    );
    expect(item?.textEdit).toEqual({
      newText: "lib/helpers",
      range: { start: { line: 0, character: 5 }, end: { line: 0, character: 11 } },
    });
  });

  test("offers no script after an include line", () => {
    expect(
      complete("include @1", { program }).items.filter((i) => i.labelDetails?.description === "script"),
    ).toEqual([]);
  });
});

const workspaceWith = (main: string, scripts: Record<string, string> = {}) => {
  const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
  for (const [uri, text] of Object.entries({ [MAIN]: main, ...scripts })) {
    documents.add({
      textDocument: { uri, languageId: "sparkdown", version: 1, text },
    });
  }
  const workspace = Object.create(
    SparkdownLanguageServerWorkspace.prototype,
  ) as SparkdownLanguageServerWorkspace;
  const watched = new Map(
    [MAIN, ...Object.keys(LUAU).map((path) => ROOT + path)].map((uri) => [uri, { uri }]),
  );
  Object.assign(workspace, {
    _documents: documents,
    _watchedFiles: watched,
    _programStates: new Map(),
    _documentVersions: new Map(),
  });
  return { workspace, documents, document: documents.get(MAIN)! };
};

describe("the run operand's rename and link", () => {
  test.each([
    ["run helpers", "run tools"],
    ['run "lib/helpers"', 'run "lib/tools"'],
    ["run './lib/helpers.luau'  # tag", "run './lib/tools.luau'  # tag"],
  ])("renames the file it names with it: %s", (line, renamed) => {
    const text = lines(line, "scene start", "  done", "end", "");
    const { workspace, documents, document } = workspaceWith(text);
    const edit = getRenameEdits(
      undefined,
      document,
      documents.tree(MAIN),
      undefined,
      workspace,
      "tools",
      document.positionAt(text.indexOf("helpers") + 2),
    );
    expect(edit?.documentChanges).toContainEqual({
      kind: "rename",
      oldUri: `${ROOT}lib/helpers.luau`,
      newUri: `${ROOT}lib/tools.luau`,
    });
    expect(
      TextDocument.applyEdits(
        TextDocument.create(MAIN, "sparkdown", 1, text),
        edit!.changes![MAIN]!,
      ),
    ).toBe(lines(renamed, "scene start", "  done", "end", ""));
  });

  test("renames every run operand that names the file, and none that does not", () => {
    const CHAPTER = `${ROOT}chapters/chapter.sd`;
    const main = lines("run helpers", 'run "./lib/helpers.luau"', "run util", "scene start", "  done", "end", "");
    const chapter = lines("scene chapter", '  run "../lib/helpers"', "  run helpers", "end", "");
    const { workspace, documents, document } = workspaceWith(main, { [CHAPTER]: chapter });
    const edit = getRenameEdits(
      undefined,
      document,
      documents.tree(MAIN),
      undefined,
      workspace,
      "tools",
      document.positionAt(main.indexOf("helpers")),
    );
    const applied = (uri: string, text: string) =>
      TextDocument.applyEdits(
        TextDocument.create(uri, "sparkdown", 1, text),
        edit!.changes![uri] ?? [],
      );
    expect(applied(MAIN, main)).toBe(
      lines("run tools", 'run "./lib/tools.luau"', "run util", "scene start", "  done", "end", ""),
    );
    expect(applied(CHAPTER, chapter)).toBe(
      lines("scene chapter", '  run "../lib/tools"', "  run tools", "end", ""),
    );
    expect(
      edit?.documentChanges?.filter((change) => "kind" in change),
    ).toEqual([
      { kind: "rename", oldUri: `${ROOT}lib/helpers.luau`, newUri: `${ROOT}lib/tools.luau` },
    ]);
  });

  test.each([
    ["run helpers", "helpers", `${ROOT}lib/helpers.luau`],
    ['run "./scripts/util"  # tag', '"./scripts/util"', `${ROOT}scripts/util.luau`],
    ["run util", "util", undefined],
    ["run elsewhere", "elsewhere", undefined],
  ])("links the operand to the file it names: %s", (line, operand, target) => {
    const text = lines(line, "scene start", "  done", "end", "");
    const { workspace, documents, document } = workspaceWith(text);
    const links = getDocumentLinks(
      document,
      documents.tree(MAIN),
      documents.annotations(MAIN),
      workspace,
    );
    const from = text.indexOf(operand);
    expect(links).toEqual([
      {
        range: {
          start: document.positionAt(from),
          end: document.positionAt(from + operand.length),
        },
        target,
      },
    ]);
  });

  test.each([
    [true, `${ROOT}lib space/helpers.luau`],
    [false, `${ROOT}lib%20space/helpers.luau`],
  ])("links a quoted path through a folder with a space (as written: %s)", (asWritten, target) => {
    const text = lines('run "lib space/helpers"', "scene start", "  done", "end", "");
    const { workspace, documents, document } = workspaceWith(text);
    Object.assign(workspace, {
      _compilerConfig: { uriPathsAsWritten: asWritten },
      _watchedFiles: new Map([[MAIN, { uri: MAIN }], [target, { uri: target }]]),
    });
    const links = getDocumentLinks(
      document,
      documents.tree(MAIN),
      documents.annotations(MAIN),
      workspace,
    );
    expect(links?.map((link) => link.target)).toEqual([target]);
  });
});

describe("an edit to a Luau file a run reads", () => {
  test("compiles its project's main script", async () => {
    const { workspace } = workspaceWith(lines("run helpers", "scene start", "  done", "end", ""));
    const compiled: [string, boolean][] = [];
    const base = Object.getPrototypeOf(SparkdownLanguageServerWorkspace.prototype);
    const spy = vi
      .spyOn(base, "compile")
      .mockImplementation(async (uri: unknown, force: unknown) => {
        compiled.push([uri as string, force as boolean]);
        return undefined;
      });
    try {
      await workspace.compile(`${ROOT}lib/helpers.luau`, false);
      await workspace.compile(`${ROOT}other/elsewhere.luau`, true);
    } finally {
      spy.mockRestore();
    }
    expect(compiled).toEqual([
      [MAIN, false],
      [`${ROOT}other/main.sd`, true],
    ]);
  });

  test("compiles every entry whose program read the file", async () => {
    const { workspace } = workspaceWith(lines('run "other/elsewhere"', "scene start", "  done", "end", ""));
    const LUAU_URI = `${ROOT}other/elsewhere.luau`;
    const OTHER = `${ROOT}other/main.sd`;
    const program = (uri: string, read: number) =>
      ({ program: { uri, scripts: { [uri]: 1, [LUAU_URI]: read } } }) as never;
    Object.assign(workspace, {
      _programStates: new Map([
        [MAIN, program(MAIN, 1)],
        [OTHER, program(OTHER, 2)],
        [`${ROOT}lib/unrelated.sd`, { program: { uri: MAIN, scripts: { [MAIN]: 1 } } }],
      ]),
      _documentVersions: new Map([[LUAU_URI, 2]]),
    });
    const compiled: [string, boolean][] = [];
    const base = Object.getPrototypeOf(SparkdownLanguageServerWorkspace.prototype);
    const spy = vi
      .spyOn(base, "compile")
      .mockImplementation(async (uri: unknown, force: unknown) => {
        compiled.push([uri as string, force as boolean]);
        return undefined;
      });
    try {
      await workspace.compile(LUAU_URI, false);
    } finally {
      spy.mockRestore();
    }
    expect(compiled).toEqual([
      [MAIN, true],
      [OTHER, false],
    ]);
  });
});
