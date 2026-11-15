import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));

const server = vi.hoisted(() => ({
  workspace: null as unknown,
  handlers: {} as Record<string, (...args: unknown[]) => unknown>,
}));

vi.mock("vscode-languageserver/browser", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const recorder = (path: string): unknown =>
    new Proxy(() => {}, {
      get: (_target, key) => recorder(`${path}.${String(key)}`),
      apply: (_target, _self, args) => {
        if (typeof args[0] === "function") {
          server.handlers[path] = args[0] as (...a: unknown[]) => unknown;
        }
        return recorder(`${path}()`);
      },
    });
  return {
    ...actual,
    BrowserMessageReader: class {},
    BrowserMessageWriter: class {},
    createConnection: () => recorder("connection"),
  };
});

vi.mock("../../classes/SparkdownLanguageServerWorkspace", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../classes/SparkdownLanguageServerWorkspace")>();
  class ServedWorkspace extends actual.SparkdownLanguageServerWorkspace {
    constructor(...args: ConstructorParameters<typeof actual.SparkdownLanguageServerWorkspace>) {
      if (server.workspace) {
        return server.workspace as ServedWorkspace;
      }
      super(...args);
    }
  }
  return { ...actual, SparkdownLanguageServerWorkspace: ServedWorkspace };
});

import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

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

const serve = async () => {
  const { workspace, program } = setup();
  workspace.program = () => program;
  workspace.listen = () => ({ dispose: () => {} });
  server.workspace = workspace;
  vi.stubGlobal("self", globalThis);
  await import("../../sparkdown-language-server");
  return server.handlers["connection.onDefinition"]!;
};

const definitionAt = async (line: number, word: string) => {
  const onDefinition = await serve();
  const character = SOURCE.split(NEWLINE)[line]!.indexOf(word) + 1;
  const answer = (await onDefinition({ textDocument: { uri: MAIN }, position: { line, character } })) as
    | { uri: string; range: { start: { line: number } } }[]
    | undefined;
  return (answer ?? []).map(({ uri, range }) => [uri, range.start.line]);
};

describe("go to definition on an asset name answers its file (#2171)", () => {
  test("a picture name answers the picture's file", async () => {
    expect(await definitionAt(8, "mara_smile")).toEqual([[SMILE, 0]]);
  });

  test("a sound name answers the sound's file", async () => {
    expect(await definitionAt(9, "theme")).toEqual([[THEME, 0]]);
  });

  test("a scene name still answers the scene's line", async () => {
    expect(await definitionAt(12, "start")).toEqual([[MAIN, 6]]);
  });
});
