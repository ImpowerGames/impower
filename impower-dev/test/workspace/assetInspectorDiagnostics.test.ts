import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
vi.mock("vscode-jsonrpc/browser", () => ({ BrowserMessageReader: class {}, BrowserMessageWriter: class {}, createMessageConnection: vi.fn() }));
const mocks = vi.hoisted(() => ({ diagnostics: vi.fn(), references: vi.fn().mockResolvedValue([]) }));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: {
  fs: { getFileUri: (pid: string, path: string) => "file:///" + pid + "/" + path, getRelativePath: (_pid: string, uri: string) => uri },
  ls: { getFileDiagnostics: mocks.diagnostics, getFileReferences: mocks.references },
} }));
vi.mock("../../src/modules/spark-editor/workspace/WorkspaceStore", () => ({ default: { signals: { projectId: { value: "project" } } } }));
vi.mock("@impower/impower-ui/components", () => ({ Button: "button", Check: "span", ChevronRight: "span", Download: "span", Link: "span", Pencil: "span", Repeat: "span", Search: "span", X: "span" }));
import WorkspaceLanguageServer from "../../src/modules/spark-editor/workspace/WorkspaceLanguageServer";
import AssetInspectorPanel from "../../src/modules/spark-editor/components/asset-inspector/AssetInspectorPanel";
const warning = { severity: 2, message: "Malformed condition face..bad" };
let host: HTMLDivElement;
async function show(path = "assets/unused.svg") {
  if (!host) { host = document.createElement("div"); document.body.append(host); }
  await act(async () => { render(h(AssetInspectorPanel, { path, name: "unused.svg", kind: "image" }), host); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
}
async function compiled() {
  await act(async () => { sendProtocolMessage(CompiledProgramMessage.type.notification({ program: {} } as any)); await new Promise(resolve => setTimeout(resolve, 0)); });
}
afterEach(() => { if (host) { act(() => render(null, host)); host.remove(); host = undefined as any; } mocks.diagnostics.mockReset(); });
describe("asset inspector problems", () => {
  it("retains asset metadata when no diagnostics are present", async () => {
    mocks.diagnostics.mockResolvedValue([]);
    await show();
    expect(host.textContent).toContain("Type");
    expect(host.textContent).toContain("image");
  });
  it("requests just the selected file after language server initialization", async () => {
    const client = Object.create(WorkspaceLanguageServer.prototype) as WorkspaceLanguageServer;
    const sendRequest = vi.fn().mockResolvedValue([warning]);
    const initialization = vi.fn().mockResolvedValue(undefined);
    Object.assign(client, { _connection: { sendRequest }, initialization });
    expect(client.getFileDiagnostics).toBeTypeOf("function");
    expect(await client.getFileDiagnostics("file:///project/assets/unused.svg")).toEqual([warning]);
    expect(initialization).toHaveBeenCalledOnce();
    expect(sendRequest).toHaveBeenCalledOnce();
    expect(sendRequest).toHaveBeenCalledWith("sparkdown/fileDiagnostics", { uri: "file:///project/assets/unused.svg" });
  });
  it("shows an unused asset warning and refreshes it away after compilation repairs it", async () => {
    mocks.diagnostics.mockResolvedValue([warning]);
    await show();
    expect(host.textContent).toContain("Malformed condition face..bad");
    expect(mocks.diagnostics).toHaveBeenCalledWith("file:///project/assets/unused.svg");
    mocks.diagnostics.mockResolvedValue([]);
    await compiled();
    expect(host.textContent).not.toContain("Malformed condition face..bad");
    expect(host.textContent).toContain("No problems");
  });
  it("discards late diagnostics for a previously selected asset", async () => {
    let finish!: (value: any[]) => void;
    mocks.diagnostics.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; })).mockResolvedValue([]);
    await show();
    await show("assets/other.svg");
    expect(finish).toBeTypeOf("function");
    await act(async () => finish([warning]));
    expect(host.textContent).not.toContain("Malformed condition face..bad");
  });
  it("discards an older refresh that resolves after the repaired result", async () => {
    mocks.diagnostics.mockResolvedValue([warning]);
    await show();
    let finish!: (value: any[]) => void;
    mocks.diagnostics.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await compiled();
    mocks.diagnostics.mockResolvedValue([]);
    await compiled();
    expect(finish).toBeTypeOf("function");
    await act(async () => finish([warning]));
    expect(host.textContent).not.toContain("Malformed condition face..bad");
  });
});
