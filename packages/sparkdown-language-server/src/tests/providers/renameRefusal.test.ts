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

const compile = (
  images: string[],
  mainText: string,
  chapterText: string,
): SparkProgram => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      scriptFile(MAIN, mainText),
      scriptFile(CHAPTER, chapterText),
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

const setup = (
  images: string[] = [IMAGE],
  mainText = MAIN_TEXT,
  chapterText = CHAPTER_TEXT,
) => {
  const documents = new SparkdownDocumentRegistry([
    "links",
    "references",
    "declarations",
  ]);
  for (const [uri, text] of [
    [MAIN, mainText],
    [CHAPTER, chapterText],
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
  const program = compile(images, mainText, chapterText);
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

describe("renaming a run operand", () => {
  const HELPER = `${ROOT}lib/helpers.luau`;
  const UTIL = `${ROOT}lib/util.luau`;
  const TEXT = lines("run helpers", "scene start", "  Done.", "end", "");

  const rename = (
    watched: string[],
    newName: string,
    operand = "helpers",
    openOnly: string[] = [],
  ) => {
    const text = TEXT.replace("run helpers", `run ${operand}`);
    const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
    documents.add({
      textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text },
    });
    for (const uri of openOnly) {
      documents.add({
        textDocument: { uri, languageId: "luau", version: 1, text: "return 1" },
      });
    }
    const workspace = Object.create(
      SparkdownLanguageServerWorkspace.prototype,
    ) as SparkdownLanguageServerWorkspace;
    Object.assign(workspace, {
      _documents: documents,
      _watchedFiles: new Map(watched.map((uri) => [uri, { uri }])),
      _programStates: new Map(),
      _documentVersions: new Map(),
    });
    const document = documents.get(MAIN)!;
    return getRenameEdits(
      { editor: { autoRenameFiles: true } },
      document,
      documents.tree(MAIN),
      undefined,
      workspace,
      newName,
      document.positionAt(text.indexOf("helpers") + 2),
    );
  };

  test("refuses a name another script already has, and changes nothing", () => {
    expect(() => rename([MAIN, HELPER, UTIL], "util")).toThrow(
      "util is already a script in this story.",
    );
  });

  test("refuses a name only an open document has so far", () => {
    expect(() => rename([MAIN, HELPER], "util", "helpers", [UTIL])).toThrow(
      "util is already a script in this story.",
    );
  });

  test("refuses a name a script in another folder has, which would leave run util ambiguous", () => {
    expect(() =>
      rename([MAIN, HELPER, `${ROOT}other/util.luau`], "util"),
    ).toThrow("util is already a script in this story.");
  });

  test.each(["", "   ", "bad/name", "bad.name", "..", 'qu"ote'])(
    "refuses %j as a script name",
    (name) => {
      expect(() => rename([MAIN, HELPER], name)).toThrow(/not a valid script name/);
    },
  );

  test("refuses a name a bare operand could not be written with, and allows it in a quoted one", () => {
    expect(() => rename([MAIN, HELPER], "my-util")).toThrow(/not a valid script name/);
    expect(rename([MAIN, HELPER], "my-util", '"lib/helpers"')?.documentChanges).toContainEqual({
      kind: "rename",
      oldUri: HELPER,
      newUri: `${ROOT}lib/my-util.luau`,
    });
  });

  test("keeps the same name as nothing to refuse", () => {
    expect(() => rename([MAIN, HELPER], "helpers")).not.toThrow();
  });

  test("renames the script when the name is free", () => {
    expect(rename([MAIN, HELPER], "util")?.documentChanges).toContainEqual({
      kind: "rename",
      oldUri: HELPER,
      newUri: UTIL,
    });
  });
});

describe("rename across scripts and asset files", () => {
  test("renaming a picture's name renames its file when Auto-rename files is on", () => {
    const { rename } = setup();
    const edit = rename("zadie", "imani", true);
    expect(editedUris(edit)).toEqual([CHAPTER, MAIN].sort());
    expect(fileRenames(edit)).toEqual([
      { kind: "rename", oldUri: IMAGE, newUri: OTHER_IMAGE },
    ]);
  });

  test("renaming a character from its cue renames its portrait file and every line that shows it", () => {
    const { rename } = setup(
      [IMAGE],
      lines(
        "define imani as character with",
        "end",
        "scene start",
        "  [[show backdrop imani]]",
        "  imani: Have you heard?",
        "end",
        "",
      ),
    );
    const edit = rename("zadie", "imani:", true);
    expect(editedUris(edit)).toEqual([CHAPTER, MAIN].sort());
    expect(fileRenames(edit)).toEqual([
      { kind: "rename", oldUri: IMAGE, newUri: OTHER_IMAGE },
    ]);
  });

  const NO_PICTURE = lines("scene chapter_one", "  A quiet page.", "end", "");

  const CHARACTER_ONLY = lines(
    "define imani as character with",
    "end",
    "scene start",
    "  imani: Have you heard?",
    "end",
    "",
  );

  test("renaming a character from its cue renames its portrait file even when no line shows the picture", () => {
    const { rename } = setup([IMAGE], CHARACTER_ONLY, NO_PICTURE);
    const edit = rename("zadie", "imani:", true);
    expect(fileRenames(edit)).toEqual([
      { kind: "rename", oldUri: IMAGE, newUri: OTHER_IMAGE },
    ]);
    expect(rename("zadie", "imani:", false)).toBeDefined();
    expect(fileRenames(rename("zadie", "imani:", false))).toEqual([]);
  });

  test("a character renamed onto a name another picture has is refused", () => {
    const { rename } = setup([IMAGE, OTHER_IMAGE], CHARACTER_ONLY, NO_PICTURE);
    expect(() => rename("zadie", "imani:", true)).toThrow(
      "zadie is already a name in this story.",
    );
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
