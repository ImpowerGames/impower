import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getRenameEdits } from "../../utils/providers/getRenameEdits";

const ROOT = "file:///proj/";
const MAIN = `${ROOT}main.sd`;
const CHAPTER = `${ROOT}chapter.sd`;
const IMAGE = `${ROOT}imani.png`;
const OTHER_IMAGE = `${ROOT}zadie.png`;
const NEWLINE = String.fromCharCode(10);

const lines = (...text: string[]) => text.join(NEWLINE);

const MAIN_TEXT = lines(
  "scene start",
  "  [[show backdrop imani]]",
  "  -> chapter_one",
  "end",
  "",
);
const CHAPTER_TEXT = lines("scene chapter_one", "  [[show backdrop imani]]", "end", "");

const scriptFile = (uri: string, text: string) => ({
  uri,
  type: "script",
  name: uri.split("/").at(-1)!.split(".")[0]!,
  ext: "sd",
  text,
  version: 1,
  languageId: "sparkdown",
});

const imageFile = (uri: string) => ({
  uri,
  type: "image",
  name: uri.split("/").at(-1)!.split(".")[0]!,
  ext: "png",
  src: uri,
  version: 1,
});

const compile = (images: string[]): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      scriptFile(MAIN, MAIN_TEXT),
      scriptFile(CHAPTER, CHAPTER_TEXT),
      ...images.map(imageFile),
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

const setup = (images: string[] = [IMAGE]) => {
  const documents = new SparkdownDocumentRegistry([
    "links",
    "references",
    "declarations",
  ]);
  for (const [uri, text] of [
    [MAIN, MAIN_TEXT],
    [CHAPTER, CHAPTER_TEXT],
  ] as const) {
    documents.add({
      textDocument: { uri, languageId: "sparkdown", version: 1, text },
    });
  }
  const workspace = Object.create(
    SparkdownLanguageServerWorkspace.prototype,
  ) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: documents,
    _watchedFiles: new Map(
      [MAIN, CHAPTER, ...images].map((uri) => [uri, { uri }]),
    ),
    _programStates: new Map(),
    _documentVersions: new Map(),
    _imageFilePattern: /[.]png$/,
  });
  const program = compile(images);
  const rename = (
    newName: string,
    at: string,
    autoRenameFiles: boolean,
    uri = MAIN,
  ) => {
    const document = documents.get(uri)!;
    return getRenameEdits(
      { editor: { autoRenameFiles } },
      document,
      documents.tree(uri),
      program,
      workspace,
      newName,
      document.positionAt(document.getText().indexOf(at) + 1),
    );
  };
  return { rename };
};

const fileRenames = (edit: ReturnType<typeof getRenameEdits>) =>
  (edit?.documentChanges ?? []).filter((c) => "kind" in c);

const editedUris = (edit: ReturnType<typeof getRenameEdits>) =>
  Object.keys(edit?.changes ?? {}).sort();

describe("rename across scripts and asset files", () => {
  test("renaming a picture's name renames its file when Auto-rename files is on", () => {
    const { rename } = setup();
    const edit = rename("zadie", "imani", true);
    expect(editedUris(edit)).toEqual([CHAPTER, MAIN].sort());
    expect(fileRenames(edit)).toEqual([
      { kind: "rename", oldUri: IMAGE, newUri: OTHER_IMAGE },
    ]);
  });

  test("with Auto-rename files off the scripts change and the file keeps its name", () => {
    const { rename } = setup();
    const edit = rename("zadie", "imani", false);
    expect(editedUris(edit)).toEqual([CHAPTER, MAIN].sort());
    expect(fileRenames(edit)).toEqual([]);
  });

  test("a name another picture already has is refused with the reason", () => {
    const { rename } = setup([IMAGE, OTHER_IMAGE]);
    expect(() => rename("zadie", "imani", true)).toThrow(
      "zadie is already a name in this story.",
    );
  });

  test("a name another scene already has is refused with the reason", () => {
    const { rename } = setup();
    expect(() => rename("start", "chapter_one", true, CHAPTER)).toThrow(
      "start is already a name in this story.",
    );
  });

  test("a name that is not a valid name is refused with the reason", () => {
    const { rename } = setup();
    expect(() => rename("chapter two", "chapter_one", true, CHAPTER)).toThrow(
      "chapter two is not a valid name.",
    );
  });

  test("a free valid name renames the scene in every script", () => {
    const { rename } = setup();
    const edit = rename("prologue", "chapter_one", true, CHAPTER);
    expect(editedUris(edit)).toEqual([CHAPTER, MAIN].sort());
  });
});
