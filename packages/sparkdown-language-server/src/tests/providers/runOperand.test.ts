// A `run` statement's operand in the language server (#1389): the quick fixes
// of its diagnostics (quote a path, pick one of a shared name's files, take a
// file's spelling when the operand differs from it only by case, #1334), the
// completion of Luau names and of paths relative to the script, renaming the
// file it names, and the link that opens it.

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

/** The project's files besides main.sd, by path below its folder. */
const LUAU = {
  "lib/helpers.luau": "local a = 1",
  "lib/util.luau": "local b = 2",
  "scripts/util.luau": "local c = 3",
  "other/main.sd": "done",
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

const errorsOf = (program: SparkProgram) =>
  (program.diagnostics?.[MAIN] ?? []).filter((d) => d.severity === 1);

/** The quick fixes main's errors offer, each with main's text after it. */
const fixesOf = (text: string, files?: Record<string, string>) => {
  const program = compile(text, files);
  const document = TextDocument.create(MAIN, "sparkdown", 1, text);
  return getCodeActions(document, errorsOf(program)).map((action) => ({
    title: action.title,
    preferred: action.isPreferred,
    text: TextDocument.applyEdits(document, action.edit!.changes![MAIN]!),
  }));
};

describe("the run operand's quick fixes", () => {
  test("quotes an unquoted path, and the quoted path runs the file", () => {
    const fixes = fixesOf(lines("run lib/helpers", "done", ""));
    expect(fixes).toEqual([
      { title: "Quote the path", preferred: true, text: lines('run "lib/helpers"', "done", "") },
    ]);
    expect(errorsOf(compile(fixes[0]!.text))).toEqual([]);
  });

  test("offers the quoted path of each file a shared name names, none preferred", () => {
    const fixes = fixesOf(lines("run util  # tag", "done", ""));
    expect(fixes).toEqual([
      { title: 'Use "lib/util"', preferred: false, text: lines('run "lib/util"  # tag', "done", "") },
      { title: 'Use "scripts/util"', preferred: false, text: lines('run "scripts/util"  # tag', "done", "") },
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
    const fixes = fixesOf(lines(`run ${operand}`, "done", ""));
    expect(fixes).toEqual([{ title, preferred: true, text: lines(fixed, "done", "") }]);
    expect(errorsOf(compile(fixes[0]!.text))).toEqual([]);
  });

  test("offers nothing for an operand no file is near", () => {
    expect(fixesOf(lines("run missing", "done", ""))).toEqual([]);
    expect(fixesOf(lines('run "missing"', "done", ""))).toEqual([]);
  });
});

/** A program of main.sd and the project's files, as completion reads it. */
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

/** A language server workspace holding main.sd and knowing the project's
 *  files, as the language server registers them. */
const workspaceWith = (main: string) => {
  const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
  documents.add({
    textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text: main },
  });
  const workspace = Object.create(
    SparkdownLanguageServerWorkspace.prototype,
  ) as SparkdownLanguageServerWorkspace;
  const watched = new Map(
    [MAIN, ...Object.keys(LUAU).map((path) => ROOT + path)].map((uri) => [uri, { uri }]),
  );
  Object.assign(workspace, { _documents: documents, _watchedFiles: watched });
  return { workspace, documents, document: documents.get(MAIN)! };
};

describe("the run operand's rename and link", () => {
  test.each([
    ["run helpers", "run tools"],
    ['run "lib/helpers"', 'run "lib/tools"'],
    ["run './lib/helpers.luau'  # tag", "run './lib/tools.luau'  # tag"],
  ])("renames the file it names with it: %s", (line, renamed) => {
    const text = lines(line, "done", "");
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
    ).toBe(lines(renamed, "done", ""));
  });

  test.each([
    ["run helpers", "helpers", `${ROOT}lib/helpers.luau`],
    ['run "./scripts/util"  # tag', '"./scripts/util"', `${ROOT}scripts/util.luau`],
    ["run util", "util", undefined],
    ["run elsewhere", "elsewhere", undefined],
  ])("links the operand to the file it names: %s", (line, operand, target) => {
    const text = lines(line, "done", "");
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
});
