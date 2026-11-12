import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";
import * as provider from "../../utils/providers/getFileReferences";
import { getFileSymbol } from "../../utils/providers/getFileSymbol";
import { collectReferencesForTarget } from "../../utils/providers/getReferences";

const ROOT = "file:///proj/";
const MAIN = `${ROOT}main.sd`;
const MARKET = `${ROOT}Scripts/market.sd`;
const NEWLINE = String.fromCharCode(10);
const lines = (...rows: string[]) => [...rows, ""].join(NEWLINE);

const HARBOR = `${ROOT}Assets/Images/harbor.png`;
const IMANI = `${ROOT}Assets/Images/imani.png`;
const UNUSED = `${ROOT}Assets/Images/unused.png`;
const THEME = `${ROOT}Assets/Audio/theme.mp3`;
const DOOR = `${ROOT}Assets/Audio/door.mp3`;

const SOURCES: Record<string, string> = {
  [MAIN]: lines(
    "scene start",
    "  [[show backdrop harbor]]",
    "  ((play music theme))",
    "  IMANI: Hello.",
    "  [[imani]]",
    "  -> market",
    "end",
  ),
  [MARKET]: lines("scene market", "  [[show backdrop harbor]]", "  [[imani]]", "  ((door))", "end"),
};

const ASSETS = [HARBOR, IMANI, UNUSED, THEME, DOOR];

const leaf = (uri: string) => uri.split("/").at(-1)!;

const setup = (sources: Record<string, string> = SOURCES) => {
  const documents = new SparkdownDocumentRegistry(["links", "references", "declarations"]);
  for (const [uri, text] of Object.entries(sources)) {
    documents.add({ textDocument: { uri, languageId: "sparkdown", version: 1, text } });
  }
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: documents,
    _watchedFiles: new Map([...Object.keys(sources), ...ASSETS].map((uri) => [uri, { uri }])),
    _programStates: new Map(),
    _documentVersions: new Map(),
    _scriptFilePattern: /[.]sd$/,
    _imageFilePattern: /[.]png$/,
    _audioFilePattern: /[.]mp3$/,
  });
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      ...Object.entries(sources).map(([uri, text]) => ({
        uri,
        type: "script",
        name: leaf(uri).split(".")[0]!,
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      })),
      ...ASSETS.map((uri) => ({
        uri,
        type: uri.endsWith(".png") ? "image" : "audio",
        name: leaf(uri).split(".")[0]!,
        ext: uri.split(".").at(-1)!,
        src: uri,
        version: 1,
      })),
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

const summary = (uses: { uri: string; range: { start: { line: number } }; role: string; text: string }[] | undefined) =>
  (uses ?? []).map((use) => [leaf(use.uri), use.range.start.line, use.role, use.text.trim()]).sort();

describe("asset usage for the whole project in one request (#1033)", () => {
  test("answers every asset file the program knows, with each use's line, role and line text", () => {
    const { workspace, program } = setup();
    const usage = provider.getAssetUsage(workspace, program, MAIN)!;
    expect(Object.keys(usage.uses).sort()).toEqual([...ASSETS].sort());
    expect(summary(usage.uses[HARBOR])).toEqual([
      ["main.sd", 1, "backdrop", "[[show backdrop harbor]]"],
      ["market.sd", 1, "backdrop", "[[show backdrop harbor]]"],
    ]);
    expect(summary(usage.uses[IMANI])).toEqual([
      ["main.sd", 4, "portrait", "[[imani]]"],
      ["market.sd", 2, "portrait", "[[imani]]"],
    ]);
    expect(summary(usage.uses[THEME])).toEqual([["main.sd", 2, "music", "((play music theme))"]]);
    expect(summary(usage.uses[DOOR])).toEqual([["market.sd", 3, "sound", "((door))"]]);
    expect(usage.uses[UNUSED]).toEqual([]);
  });

  test("carries the program's version and the scripts' include graph, so the page can order uses by story", () => {
    const { workspace, program } = setup();
    const usage = provider.getAssetUsage(workspace, program, MAIN)!;
    expect(usage.version).toBe(program.version);
    expect(usage.scripts).toContainEqual({ from: MAIN, to: MARKET, divert: true });
  });

  test("answers nothing until there is a program, so the page keeps counting", () => {
    const { workspace } = setup();
    expect(provider.getAssetUsage(workspace, undefined, MAIN)).toBeNull();
  });

  test("gives a single file the same uses as the batch, so the two answers cannot disagree", () => {
    const { workspace, program } = setup();
    const usage = provider.getAssetUsage(workspace, program, MAIN)!;
    for (const uri of ASSETS) {
      expect(provider.getFileReferences(workspace, program, uri)!.references).toEqual(usage.uses[uri]);
    }
  });

  test("finds, in one pass, the same lines the per-file reference search finds for each file", () => {
    const { workspace, program } = setup();
    const usage = provider.getAssetUsage(workspace, program, MAIN)!;
    for (const uri of ASSETS) {
      const symbol = getFileSymbol(workspace, uri)!;
      const { references } = collectReferencesForTarget(
        program,
        workspace,
        { symbolName: symbol.name, symbolIds: symbol.symbolIds },
        { searchOtherFiles: true, includeDeclaration: true, includeInterdependent: false, includeLinks: true, addAssetFiles: false },
      );
      const located = (list: { uri: string; range: unknown; kind?: unknown }[]) =>
        list.map(({ uri: at, range, kind }) => ({ uri: at, range, kind }));
      expect(located(usage.uses[uri]!)).toEqual(located(references));
    }
  });

  test("follows a script edit: a use added or removed changes the next answer", () => {
    const before = setup();
    expect(provider.getAssetUsage(before.workspace, before.program, MAIN)!.uses[UNUSED]).toEqual([]);
    const after = setup({ ...SOURCES, [MARKET]: lines("scene market", "  [[show backdrop unused]]", "end") });
    const usage = provider.getAssetUsage(after.workspace, after.program, MAIN)!;
    expect(summary(usage.uses[UNUSED])).toEqual([["market.sd", 1, "backdrop", "[[show backdrop unused]]"]]);
    expect(summary(usage.uses[HARBOR])).toEqual([["main.sd", 1, "backdrop", "[[show backdrop harbor]]"]]);
  });
});
