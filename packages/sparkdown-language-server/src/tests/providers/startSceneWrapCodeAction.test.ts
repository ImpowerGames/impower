import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { TOP_LEVEL_STATEMENT_MESSAGE } from "@impower/sparkdown/src/compiler/utils/declarationOnly";
import { describe, expect, test, vi } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getCodeActions } from "../../utils/providers/getCodeActions";

const MAIN = "file://proj/main.sd";
const DEFS = "file://proj/scripts/defs.sd";
const NEWLINE = String.fromCharCode(10);

const lines = (...text: string[]) => text.join(NEWLINE);

const messageOf = (d: { message: string | { value: string } }) =>
  typeof d.message === "string" ? d.message : d.message.value;

const project = (
  main: string,
  defs = lines("store gold = 1", ""),
  entry = MAIN,
) => {
  const texts: Record<string, string> =
    entry === MAIN ? { [MAIN]: main, [DEFS]: defs } : { [entry]: defs };
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: Object.entries(texts).map(([uri, text]) => ({
      uri,
      type: "script",
      name: uri.split("/").at(-1)!.split(".")[0]!,
      ext: "sd",
      text,
      version: 1,
      languageId: "sparkdown",
    })) as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  let program: SparkProgram;
  try {
    program = compiler.compile({ textDocument: { uri: entry } }).program;
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
  const documents = new SparkdownDocumentRegistry([]);
  for (const [uri, text] of Object.entries(texts)) {
    documents.add({
      textDocument: { uri, languageId: "sparkdown", version: 1, text },
    });
  }
  const workspace = Object.create(
    SparkdownLanguageServerWorkspace.prototype,
  ) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: documents,
    _entryPrograms: new Map([[entry, program]]),
    _watchedFiles: new Map([MAIN, DEFS].map((uri) => [uri, {}])),
  });
  return { program, workspace, texts };
};

const topLevelDiagnostic = (program: SparkProgram, uri: string, line: number) => {
  const diagnostic = (program.diagnostics?.[uri] ?? []).find(
    (d) => messageOf(d) === TOP_LEVEL_STATEMENT_MESSAGE && d.range.start.line === line,
  );
  expect(diagnostic).toBeDefined();
  return diagnostic!;
};

const actionsOn = (main: string, line: number, defs?: string) => {
  const { program, workspace, texts } = project(main, defs);
  const document = TextDocument.create(MAIN, "sparkdown", 1, texts[MAIN]!);
  return getCodeActions(
    document,
    [topLevelDiagnostic(program, MAIN, line)],
    workspace.startSceneMissingIn(MAIN),
  ).map((action) => ({
    title: action.title,
    kind: action.kind,
    text: TextDocument.applyEdits(document, action.edit!.changes![MAIN]!),
  }));
};

describe("the Wrap in scene start quick fix", { timeout: 60000 }, () => {
  test("wraps a top-level display line and the runnable lines around it in scene start and end, indented", () => {
    const main = lines(
      "store gold = 1",
      "",
      "Hello.",
      "BUNNY: Hi.",
      "",
      "& gold = 2",
      "if gold > 1 then",
      "  Rich.",
      "end",
      "",
      "scene other",
      "  Other.",
      "end",
      "",
    );
    expect(actionsOn(main, 2)).toEqual([
      {
        title: "Wrap in scene start",
        kind: "quickfix",
        text: lines(
          "store gold = 1",
          "",
          "scene start",
          "  Hello.",
          "  BUNNY: Hi.",
          "",
          "  & gold = 2",
          "  if gold > 1 then",
          "    Rich.",
          "  end",
          "end",
          "",
          "scene other",
          "  Other.",
          "end",
          "",
        ),
      },
    ]);
  });

  test("wraps only the run the diagnosed line belongs to, and indents by the script's indent", () => {
    const main = lines(
      "Hello.",
      "store gold = 1",
      "Bye.",
      "scene other",
      "    Other.",
      "end",
      "",
    );
    expect(actionsOn(main, 2).map((a) => a.text)).toEqual([
      lines(
        "Hello.",
        "store gold = 1",
        "scene start",
        "    Bye.",
        "end",
        "scene other",
        "    Other.",
        "end",
        "",
      ),
    ]);
  });

  test("leaves a wrapped script without the diagnostics it fixed", () => {
    const [action] = actionsOn(lines("Hello.", "Bye.", ""), 0);
    const { program } = project(action!.text);
    expect(
      Object.values(program.diagnostics ?? {})
        .flat()
        .filter((d) => d.severity === 1)
        .map(messageOf),
    ).toEqual([]);
  });

  test("leaves the lines inside a multiline string as they are", () => {
    const main = lines(
      "& print([[Alpha",
      "  Beta",
      "",
      "Gamma]])",
      '& message = "one\\',
      'two"',
      "Hello.",
      "",
    );
    expect(actionsOn(main, 6).map((a) => a.text)).toEqual([
      lines(
        "scene start",
        "  & print([[Alpha",
        "  Beta",
        "",
        "Gamma]])",
        '  & message = "one\\',
        'two"',
        "  Hello.",
        "end",
        "",
      ),
    ]);
  });

  test("is not offered once a script declares a start scene", () => {
    expect(
      actionsOn(
        lines("Hello.", ""),
        0,
        lines("store gold = 1", "scene start", "  Hi.", "end", ""),
      ),
    ).toEqual([]);
  });

  test("is not offered for a top-level line in a script other than main.sd", () => {
    const defs = lines("store gold = 1", "Stray.", "");
    const { program, workspace } = project(lines("Hello.", ""), defs);
    const document = TextDocument.create(DEFS, "sparkdown", 1, defs);
    expect(
      getCodeActions(
        document,
        [topLevelDiagnostic(program, DEFS, 1)],
        workspace.startSceneMissingIn(DEFS),
      ),
    ).toEqual([]);
  });

  test("is not offered for a script other than main.sd compiled on its own", () => {
    const stray = lines("Stray.", "");
    const { program, workspace } = project("", stray, DEFS);
    expect(program.uri).toBe(DEFS);
    const document = TextDocument.create(DEFS, "sparkdown", 1, stray);
    expect(
      getCodeActions(
        document,
        [topLevelDiagnostic(program, DEFS, 0)],
        workspace.startSceneMissingIn(DEFS),
      ),
    ).toEqual([]);
  });

  test("is carried in the diagnostic's data for a client that asks for no code actions", () => {
    const main = lines("Hello.", "");
    const { program, workspace } = project(main);
    const published = workspace
      .getDiagnostics(program, MAIN)
      .find((d) => messageOf(d) === TOP_LEVEL_STATEMENT_MESSAGE);
    expect(published?.data).toEqual([
      {
        name: "Wrap in scene start",
        changes: [
          {
            from: 0,
            to: "Hello.".length,
            insert: lines("scene start", "  Hello.", "end"),
          },
        ],
      },
    ]);
  });
});
