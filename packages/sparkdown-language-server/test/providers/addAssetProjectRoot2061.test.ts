import { SparkdownCompiler } from "@impower/sparkdown/src/compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { afterEach, describe, expect, test, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../src/classes/SparkdownLanguageServerWorkspace";
import { getCodeActions } from "../../src/utils/providers/getCodeActions";

const MAIN = "file:///proj/Game/main.sd";
const SCENE = "file:///proj/Game/scenes/intro.sd";
const DRAFT = "file:///proj/Game/.drafts/draft.sd";
const text = ["scene start", "  ((play sound boom))", "  Hello.", "end", ""].join(String.fromCharCode(10));

function setup(scriptUri: string, withMain: boolean) {
  const files = [
    ...(withMain ? [{ uri: MAIN, text: ["include scenes/intro.sd", ""].join(String.fromCharCode(10)) }] : []),
    { uri: scriptUri, text },
  ].map(file => ({ ...file, type: "script", name: "main", ext: "sd", version: 1, languageId: "sparkdown" }));
  const compiler = new SparkdownCompiler();
  compiler.configure({ files } as never);
  const documents = new SparkdownDocumentRegistry([]);
  for (const file of files) documents.add({ textDocument: file });
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: documents,
    _documentVersions: new Map(files.map(file => [file.uri, 1])),
    _watchedFiles: new Map(files.map(file => [file.uri, {}])),
    _programStates: new Map(),
    _entryPrograms: new Map(),
    _lastPublishedDiagnostics: new Map(),
    _onNextCompiled: new Map(),
    _pendingChangeCompileUris: new Set(),
    _compilesInFlight: 0,
    _openDocuments: new Set(),
    _scriptFilePattern: /[.]sd$/,
    _clientCapabilities: { textDocument: { codeAction: {} } },
    compileDocument: async (uri: string) => compiler.compile({ textDocument: { uri } }),
    attachLazyImageData: () => {},
    morphRefs: () => [],
    bakeProgramMorphs: () => {},
    sendNotification: vi.fn(),
    sendRequest: vi.fn(),
  });
  return workspace;
}

afterEach(() => vi.restoreAllMocks());
describe("the project root an Add to assets fix carries, without being given a program", () => {
  test("names the root of the program a member script compiled in", async () => {
    const workspace = setup(SCENE, true);
    const quiet = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    quiet.forEach(spy => spy.mockImplementation(() => {}));
    const program = await workspace.compile(SCENE, false);
    expect(program?.uri).toBe(MAIN);
    expect(workspace.program(SCENE)?.uri).toBe(MAIN);
    const diagnostics = workspace.getDiagnostics(program!, SCENE);
    expect(diagnostics.some(d => String(d.message).includes("Cannot find audio named"))).toBe(true);
    const actions = getCodeActions(
      workspace.document(SCENE),
      diagnostics,
      workspace.startSceneMissingIn(SCENE),
      workspace.projectRootOf(SCENE),
    );
    expect(actions.find(action => action.command)?.command?.arguments).toEqual([
      { name: "boom", type: "audio", root: "file:///proj/Game/" },
    ]);
  });

  test("names a standalone script's own folder", async () => {
    const workspace = setup("file:///proj/notes/draft.sd", false);
    const quiet = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    quiet.forEach(spy => spy.mockImplementation(() => {}));
    await workspace.compile("file:///proj/notes/draft.sd", false);
    expect(workspace.projectRootOf("file:///proj/notes/draft.sd")).toBe("file:///proj/notes/");
  });

  test("names a hidden script's own folder, since the main program leaves it out", async () => {
    const workspace = setup(DRAFT, true);
    const quiet = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error")];
    quiet.forEach(spy => spy.mockImplementation(() => {}));
    const program = await workspace.compile(DRAFT, false);
    expect(program?.uri).toBe(DRAFT);
    expect(workspace.projectRootOf(DRAFT)).toBe("file:///proj/Game/.drafts/");
  });

  test("falls back to the script's folder before any program has compiled", () => {
    const workspace = setup(SCENE, true);
    expect(workspace.projectRootOf(SCENE)).toBe("file:///proj/Game/scenes/");
  });
});

