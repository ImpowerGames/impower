import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test, vi } from "vitest";
import type { CodeAction, Diagnostic } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import {
  getCodeActions,
  getDiagnosticActions,
} from "../../utils/providers/getCodeActions";
import { getTodoNotes } from "../../utils/providers/getTodoNotes";

const MAIN = "file:///proj/main.sd";
const NEWLINE = String.fromCharCode(10);

const lines = (...text: string[]) => text.join(NEWLINE);

const image = (name: string) => ({
  uri: `file:///proj/assets/${name}.png`,
  type: "image",
  name,
  ext: "png",
  src: `/file:/local/assets/${name}.png`,
});

const compile = (main: string, images: string[] = []): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri: MAIN,
        type: "script",
        name: "main",
        ext: "sd",
        text: main,
        version: 1,
        languageId: "sparkdown",
      },
      ...images.map(image),
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

const messageOf = (d: { message: string | { value: string } }) =>
  typeof d.message === "string" ? d.message : d.message.value;

const cannotFind = (program: SparkProgram) =>
  (program.diagnostics?.[MAIN] ?? []).filter((d) =>
    messageOf(d).startsWith("Cannot find"),
  ) as Diagnostic[];

const todoNotes = (text: string) => {
  const documents = new SparkdownDocumentRegistry(["declarations"]);
  documents.add({
    textDocument: { uri: MAIN, text, version: 1, languageId: "sparkdown" },
  });
  return getTodoNotes(documents.get(MAIN)!, documents.tree(MAIN));
};

const applied = (text: string, action: CodeAction) =>
  TextDocument.applyEdits(
    TextDocument.create(MAIN, "sparkdown", 1, text),
    action.edit!.changes![MAIN]!,
  );

const summary = (text: string, diagnostics: Diagnostic[]) => {
  const document = TextDocument.create(MAIN, "sparkdown", 1, text);
  return getCodeActions(document, diagnostics).map((action) => ({
    title: action.title,
    done: (action.data as { done?: string } | undefined)?.done,
    text: applied(text, action),
  }));
};

const show = (name: string) =>
  lines("scene start", `  [[show portrait ${name}]]`, "  Hello.", "end", "");

describe("the close-match quick fix", () => {
  test("replaces a misspelled image name with its one close match", () => {
    const text = show("alcie");
    const diagnostics = cannotFind(compile(text, ["alice", "bob"]));
    expect(diagnostics.map(messageOf)).toEqual(["Cannot find image named `alcie`"]);
    expect(summary(text, diagnostics)).toEqual([
      { title: "Use alice instead", done: "Changed to alice.", text: show("alice") },
    ]);
    expect(cannotFind(compile(show("alice"), ["alice", "bob"]))).toEqual([]);
  });

  test("replaces a misspelled typed asset name in a define", () => {
    const define = (name: string) =>
      lines(
        "First beat.",
        "",
        "define warm as filtered_image with",
        `  image = image.${name}`,
        "end",
        "",
      );
    const text = define("backdrp");
    const diagnostics = cannotFind(compile(text, ["backdrop"]));
    expect(diagnostics.map(messageOf)).toEqual(["Cannot find image named `backdrp`"]);
    expect(summary(text, diagnostics)).toEqual([
      {
        title: "Use backdrop instead",
        done: "Changed to backdrop.",
        text: define("backdrop"),
      },
    ]);
  });

  test.each([
    ["no declared name is close", "zed", ["alice", "bob"]],
    ["two declared names are equally close", "bob", ["bab", "bub"]],
  ])("offers nothing when %s", (_, name, images) => {
    const text = show(name);
    const diagnostics = cannotFind(compile(text, images));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]!.data).toBeUndefined();
    expect(summary(text, diagnostics)).toEqual([]);
  });

  test("offers a name declared after the compile that reported the misspelling", () => {
    const compiler = new SparkdownCompiler();
    const script = (text: string, version: number) => ({
      uri: MAIN,
      type: "script",
      name: "main",
      ext: "sd",
      text,
      version,
      languageId: "sparkdown",
    });
    const text = show("alcie");
    compiler.configure({ files: [script(text, 1), image("bob")] as never });
    const first = compiler.compile({ textDocument: { uri: MAIN } }).program;
    expect(cannotFind(first)[0]?.data).toBeUndefined();
    compiler.addFile({ file: image("alice") as never });
    const second = compiler.compile({ textDocument: { uri: MAIN } }).program;
    expect(summary(text, cannotFind(second)).map((a) => a.title)).toEqual([
      "Use alice instead",
    ]);
  });

  test("refuses a fix whose name was edited since the diagnostic", () => {
    const diagnostics = cannotFind(compile(show("alcie"), ["alice"]));
    expect(summary(show("alcxe"), diagnostics)).toEqual([]);
    expect(summary(show("alice"), diagnostics)).toEqual([]);
    expect(
      getDiagnosticActions(
        TextDocument.create(MAIN, "sparkdown", 1, show("alcxe")),
        diagnostics[0]!,
      ),
    ).toEqual([]);
  });

  test.each(["alciex", "alcie_2", "alcie-extra", "xalcie"])(
    "refuses a fix whose name was extended to %s since the diagnostic",
    (edited) => {
      const diagnostics = cannotFind(compile(show("alcie"), ["alice"]));
      const text = edited.startsWith("x")
        ? show("alcie").replace(" alcie", "xalcie")
        : show(edited);
      expect(summary(text, diagnostics)).toEqual([]);
      expect(
        getDiagnosticActions(
          TextDocument.create(MAIN, "sparkdown", 1, text),
          diagnostics[0]!,
        ),
      ).toEqual([]);
    },
  );
});

describe("the remove-the-note quick fix", () => {
  const SCRIPT = lines(
    "// TODO: fix this",
    "scene start",
    "  Hello. // todo later",
    "  // Todo",
    "end",
    "",
  );

  test("removes a note's whole line, or only a trailing note and the space before it", () => {
    const notes = todoNotes(SCRIPT);
    expect(notes).toHaveLength(3);
    expect(notes.flatMap((note) => summary(SCRIPT, [note]))).toEqual([
      {
        title: "Remove the note",
        done: "Note removed.",
        text: lines("scene start", "  Hello. // todo later", "  // Todo", "end", ""),
      },
      {
        title: "Remove the note",
        done: "Note removed.",
        text: lines("// TODO: fix this", "scene start", "  Hello.", "  // Todo", "end", ""),
      },
      {
        title: "Remove the note",
        done: "Note removed.",
        text: lines("// TODO: fix this", "scene start", "  Hello. // todo later", "end", ""),
      },
    ]);
  });

  test("removes a block comment's note and leaves the comment open and closed where it was", () => {
    const text = lines(
      "scene start",
      "  /* todo: first",
      "  todo: second",
      "  done */",
      "  /* TODO one line */",
      "  Hello.",
      "end",
      "",
    );
    expect(todoNotes(text).flatMap((note) => summary(text, [note]))).toEqual([
      {
        title: "Remove the note",
        done: "Note removed.",
        text: lines("scene start", "  /*", "  todo: second", "  done */", "  /* TODO one line */", "  Hello.", "end", ""),
      },
      {
        title: "Remove the note",
        done: "Note removed.",
        text: lines("scene start", "  /* todo: first", "  done */", "  /* TODO one line */", "  Hello.", "end", ""),
      },
    ]);
  });

  test("removes a note on a last line with no line break of its own", () => {
    const text = lines("Hello.", "// TODO: last");
    expect(summary(text, todoNotes(text)).map((a) => a.text)).toEqual(["Hello."]);
  });

  test("keys on the note's source, not its message", () => {
    const [note] = todoNotes(SCRIPT);
    expect(
      summary(SCRIPT, [{ ...note!, message: "Anything at all" }]).map((a) => a.title),
    ).toEqual(["Remove the note"]);
    expect(summary(SCRIPT, [{ ...note!, source: "sparkdown" }])).toEqual([]);
  });

  test("refuses a fix whose note was edited since the diagnostic", () => {
    const [note] = todoNotes(SCRIPT);
    expect(summary(SCRIPT.replace("fix this", "fix that"), [note!])).toEqual([]);
  });

  test.each([
    ["an own-line note", 0, "fix this", "fix this please"],
    ["a trailing note", 1, "todo later", "todo later please"],
  ])("refuses the fix for %s once the note was extended since the diagnostic", (_, index, find, replace) => {
    const note = todoNotes(SCRIPT)[index]!;
    const text = SCRIPT.replace(find, replace);
    expect(summary(text, [note])).toEqual([]);
    expect(
      getDiagnosticActions(TextDocument.create(MAIN, "sparkdown", 1, text), note),
    ).toEqual([]);
  });
});

describe("quick fix notes", () => {
  test("a diagnostic with no mechanical fix, such as a Luau type error, offers nothing", () => {
    const text = lines(
      "---",
      "typecheck: strict",
      "---",
      "",
      "scene start",
      '  & local n: number = "text"',
      "end",
      "",
    );
    const errors = (compile(text).diagnostics?.[MAIN] ?? []) as Diagnostic[];
    expect(errors.map(messageOf)).toContain(
      "Expected this to be 'number', but got 'string'",
    );
    expect(summary(text, errors)).toEqual([]);
  });

  test("the web editor's diagnostic data carries the same fixes, with the same notes, that the provider gives VS Code", () => {
    const text = lines(
      "include scripts/defs.sd",
      "// TODO: tidy",
      "store gold = 0",
      "scene start",
      "  store gold = 1",
      "  [[show portrait alcie]]",
      "  Gold: {gold}. // todo later",
      "end",
      "",
    );
    const program = compile(text, ["alice"]);
    const workspace = Object.create(
      SparkdownLanguageServerWorkspace.prototype,
    ) as SparkdownLanguageServerWorkspace;
    const documents = new SparkdownDocumentRegistry(["declarations"]);
    documents.add({
      textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text },
    });
    Object.assign(workspace, { _documents: documents, _watchedFiles: new Map() });
    const webEditor = workspace.getDiagnostics(program, MAIN);
    Object.assign(workspace, {
      _clientCapabilities: { textDocument: { codeAction: {} } },
    });
    const vscode = workspace.getDiagnostics(program, MAIN);
    const document = TextDocument.create(MAIN, "sparkdown", 1, text);

    const fromProvider = vscode.map((diagnostic) =>
      getCodeActions(document, [diagnostic as Diagnostic]).map((action) => ({
        name: action.title,
        done: (action.data as { done: string }).done,
        ...((action.data as { expect?: string }).expect !== undefined
          ? { expect: (action.data as { expect: string }).expect }
          : {}),
        changes: action.edit!.changes![MAIN]!.map((edit) => ({
          from: document.offsetAt(edit.range.start),
          to: document.offsetAt(edit.range.end),
          insert: edit.newText,
        })),
      })),
    );
    const fromData = webEditor.map((diagnostic) => diagnostic.data ?? []);
    expect(fromData).toEqual(fromProvider);

    const all = fromData.flat();
    expect(all.map((action) => [action.name, action.done]).sort()).toEqual(
      [
        ["Change to an assignment", "Changed to an assignment."],
        ["Delete this line", "Line deleted."],
        ["Remove the note", "Note removed."],
        ["Remove the note", "Note removed."],
        ["Use alice instead", "Changed to alice."],
      ].sort(),
    );
    expect(all.filter((action) => action.expect !== undefined).map((a) => a.expect).sort()).toEqual(
      ["// TODO: tidy", "// todo later", "alcie"].sort(),
    );
  });
});
