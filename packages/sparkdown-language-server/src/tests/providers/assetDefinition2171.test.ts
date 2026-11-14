import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import { getDefinition } from "../../utils/providers/getDefinition";

const ROOT = "file:///proj/";
const MAIN = `${ROOT}main.sd`;
const SMILE = `${ROOT}images/mara_smile.png`;
const THEME = `${ROOT}audio/theme.mp3`;
const NEWLINE = String.fromCharCode(10);
const SOURCE = [
  "store visits = 0",
  "",
  "define mara as character with",
  '  name = "Mara"',
  "end",
  "",
  "scene start",
  "  The lantern hums.",
  "  [[show portrait mara_smile]]",
  "  ((play music theme))",
  "  MARA:",
  "    The lantern is lit.",
  "  -> start",
  "end",
  "",
].join(NEWLINE);

const setup = () => {
  const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
  documents.add({ textDocument: { uri: MAIN, languageId: "sparkdown", version: 1, text: SOURCE } });
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: documents,
    _watchedFiles: new Map([MAIN, SMILE, THEME].map((uri) => [uri, { uri }])),
    _programStates: new Map(),
    _documentVersions: new Map(),
    _scriptFilePattern: /[.]sd$/,
    _imageFilePattern: /[.]png$/,
    _audioFilePattern: /[.]mp3$/,
    _fontFilePattern: /[.]ttf$/,
  });
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      { uri: MAIN, type: "script", name: "main", ext: "sd", text: SOURCE, version: 1, languageId: "sparkdown" },
      { uri: SMILE, type: "image", ext: "png", name: "mara_smile", src: SMILE, version: 1 },
      { uri: THEME, type: "audio", ext: "mp3", name: "theme", src: THEME, version: 1 },
    ] as never,
  });
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    const program = compiler.compile({ textDocument: { uri: MAIN } }).program;
    return { workspace, program };
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

const definitionAt = (line: number, word: string) => {
  const { workspace, program } = setup();
  const character = SOURCE.split(NEWLINE)[line]!.indexOf(word) + 1;
  return (
    getDefinition(workspace.document(MAIN), workspace.tree(MAIN), program, workspace, { line, character }) ?? []
  ).map(({ uri, range }) => [uri, range.start.line]);
};

describe("go to definition on an asset name answers its file (#2171)", () => {
  test("a picture name answers the picture's file", () => {
    expect(definitionAt(8, "mara_smile")).toEqual([[SMILE, 0]]);
  });

  test("a sound name answers the sound's file", () => {
    expect(definitionAt(9, "theme")).toEqual([[THEME, 0]]);
  });

  test("a scene name still answers the scene's line", () => {
    expect(definitionAt(12, "start")).toEqual([[MAIN, 6]]);
  });
});
