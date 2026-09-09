import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { describe, expect, it, vi } from "vitest";
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
});
