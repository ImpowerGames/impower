import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("@impower/sparkdown/src/worker/sparkdown.worker", () => ({ default: "" }));
import { SparkdownLanguageServerWorkspace } from "../../classes/SparkdownLanguageServerWorkspace";

const main = "file:///project/main.sd";
const asset = "file:///project/assets/unused.svg";
const warning = { severity: 2, message: "Malformed condition face..bad", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } } };
function setup() {
  const handlers = new Map<string, (params: any) => any>();
  const workspace = Object.create(SparkdownLanguageServerWorkspace.prototype) as SparkdownLanguageServerWorkspace;
  Object.assign(workspace, {
    _documents: new SparkdownDocumentRegistry([]),
    _scriptFilePattern: /\.sd$/,
    _imageFilePattern: /\.svg$/,
    _documentVersions: new Map([[main, 1]]),
    _lastPublishedDiagnostics: new Map(),
    _lastFormattedText: new Map(),
    _watchedFiles: new Map([[main, {}], [asset, {}]]),
    _programStates: new Map(),
    _connection: new Proxy({}, { get: (_target, key) => key === "onRequest" ? (method: string, handler: (params: any) => any) => { handlers.set(method, handler); return { dispose() {} }; } : () => ({ dispose() {} }) }),
    sendNotification: vi.fn(), sendRequest: vi.fn(),
  });
  return { workspace, handlers, publishes: () => vi.mocked(workspace.sendNotification).mock.calls.filter(([method]) => method === "textDocument/publishDiagnostics").map(([, params]) => params as any) };
}

afterEach(() => vi.restoreAllMocks());
describe("asset diagnostic delivery", () => {
  it("publishes an unused asset warning and clears it after repair, without repeated notifications", () => {
    const { workspace, publishes } = setup();
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program: { diagnostics: { [asset]: [warning] } } });
    expect(publishes()).toContainEqual({ uri: asset, diagnostics: [warning], version: undefined });
    const count = publishes().length;
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program: { diagnostics: { [asset]: [warning] } } });
    expect(publishes()).toHaveLength(count);
    workspace.onCompiledTextDocument({ textDocument: { uri: main }, program: { diagnostics: {} } });
    expect(publishes().filter(p => p.uri === asset).map(p => p.diagnostics)).toEqual([[warning], []]);
  });
  it("clears a deleted asset immediately", () => {
    const { workspace, publishes } = setup();
    workspace.onCompiledTextDocument({ program: { diagnostics: { [asset]: [warning] } } });
    workspace.onDeletedFile({ uri: asset, name: "unused", ext: "svg", type: "image" });
    expect(publishes().filter(p => p.uri === asset).map(p => p.diagnostics)).toEqual([[warning], []]);
  });
  it("republishes unchanged script diagnostics at a newer document version", () => {
    const { workspace, publishes } = setup();
    workspace.onCompiledTextDocument({ program: { diagnostics: { [main]: [warning] } } });
    (workspace as any)._documentVersions.set(main, 2);
    workspace.onCompiledTextDocument({ program: { diagnostics: { [main]: [warning] } } });
    expect(publishes().map(p => p.version)).toEqual([1, 2]);
  });
  it("serves asset diagnostics from the cached main program without parsing or compiling the SVG", async () => {
    const { workspace, handlers } = setup();
    const compile = vi.spyOn(workspace, "compile");
    (workspace as any)._programStates.set(main, { program: { diagnostics: { [asset]: [warning] } } });
    workspace.listen();
    const handler = handlers.get("sparkdown/fileDiagnostics");
    expect(handler).toBeDefined();
    expect(await handler!({ uri: asset })).toEqual([warning]);
    (workspace as any)._programStates.set(main, { program: { diagnostics: {} } });
    expect(await handler!({ uri: asset })).toEqual([]);
    expect(compile).not.toHaveBeenCalled();
  });
  it.each([false, true])("standard diagnostic pulls serve asset warnings and repairs without compiling SVG (opened: %s)", async (opened) => {
    const { workspace, handlers } = setup();
    const compile = vi.spyOn(workspace, "compile").mockResolvedValue(undefined);
    if (opened) (workspace as any)._documents.add({ textDocument: { uri: asset, languageId: "xml", version: 1, text: "<svg/>" } });
    (workspace as any)._programStates.set(main, { program: { diagnostics: { [asset]: [warning] } } });
    workspace.listen();
    const handler = handlers.get("textDocument/diagnostic")!;
    expect(await handler({ textDocument: { uri: asset } })).toEqual({ kind: "full", items: [warning] });
    (workspace as any)._programStates.set(main, { program: { diagnostics: {} } });
    expect(await handler({ textDocument: { uri: asset }, previousResultId: "old" })).toEqual({ kind: "full", items: [] });
    expect(compile).not.toHaveBeenCalled();
  });
  it("standard script diagnostic pulls still compile the script and publish its version", async () => {
    const { workspace, handlers } = setup();
    (workspace as any)._documents.add({ textDocument: { uri: main, languageId: "sparkdown", version: 3, text: "Hello" } });
    const compile = vi.spyOn(workspace, "compile").mockResolvedValue({ diagnostics: { [main]: [warning] } } as any);
    workspace.listen();
    expect(await handlers.get("textDocument/diagnostic")!({ textDocument: { uri: main } })).toEqual({ kind: "full", resultId: "3", items: [warning] });
    expect(compile).toHaveBeenCalledWith(main, false);
  });

  it("guards all compilation entry points against assets, including semantic-token pulls", async () => {
    const { workspace } = setup();
    const program = { diagnostics: { [asset]: [warning] } } as any;
    const workerCompile = vi.spyOn(SparkdownWorkspace.prototype, "compile").mockImplementation(async function (this: SparkdownWorkspace, uri) {
      (this as any)._lastCompiledUri = uri;
      return program;
    });
    (workspace as any)._programStates.set(main, { program });
    (workspace as any)._lastCompiledUri = main;
    expect(await workspace.compile(asset, false)).toBe(program);
    expect((workspace as any)._lastCompiledUri).toBe(main);
    expect(workerCompile).not.toHaveBeenCalled();
    (workspace as any)._programStates.clear();
    expect(await workspace.compile(asset, true)).toBeUndefined();
    expect(workerCompile).not.toHaveBeenCalled();
  });
  it.each([main, "untitled:Untitled-1"])("preserves compilation and standard diagnostic pulls for Sparkdown scripts: %s", async (uri) => {
    const { workspace, handlers } = setup();
    const program = { diagnostics: { [uri]: [warning] } } as any;
    const workerCompile = vi.spyOn(SparkdownWorkspace.prototype, "compile").mockResolvedValue(program);
    (workspace as any)._documents.add({ textDocument: { uri, languageId: "sparkdown", version: 4, text: "Hello" } });
    expect(await workspace.compile(uri, false)).toBe(program);
    expect(workerCompile).toHaveBeenCalledWith(uri, false);
    workspace.listen();
    expect(await handlers.get("textDocument/diagnostic")!({ textDocument: { uri } })).toEqual({ kind: "full", resultId: "4", items: [warning] });
    expect(workerCompile).toHaveBeenCalledTimes(2);
  });

});
