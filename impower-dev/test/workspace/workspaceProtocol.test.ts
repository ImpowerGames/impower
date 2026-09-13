import { expect, it, vi } from "vitest";
import { createProtocolBridge } from "../../src/modules/spark-editor/workspace/devProtocolBridge";
import { registerWorkspaceProtocol } from "../../src/modules/spark-editor/workspace/workspaceProtocol";

const workspace = vi.hoisted(() => ({
  ls: { initialization: vi.fn(async () => {}), connection: { sendRequest: vi.fn() } },
  fs: { readFile: vi.fn(), readDirectoryFiles: vi.fn(), unzipFiles: vi.fn(), createFiles: vi.fn(), deleteFiles: vi.fn(), getFileSrc: vi.fn() },
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({ Workspace: workspace }));

it("answers fresh diagnostics and hover on the shared bus and forwards imports to the editor filesystem", async () => {
  const dispose = registerWorkspaceProtocol();
  const bridge = createProtocolBridge(window);
  const events: any[] = [];
  bridge.subscribe((message) => events.push(message));
  let id = 0;
  const send = (method: string, params: any = {}) => bridge.send({ jsonrpc: "2.0", id: ++id, method, params });
  try {
    workspace.ls.connection.sendRequest.mockResolvedValueOnce({ kind: "full", resultId: "7", items: [{ message: "fresh", severity: 1 }] });
    expect(await send("textDocument/diagnosticsSettled", { textDocument: { uri: "file://local/main.sd" }, version: 7 })).toMatchObject({ version: 7, diagnostics: [{ message: "fresh" }] });
    expect(events[0]).toMatchObject({ method: "textDocument/didSettleDiagnostics", params: { version: 7 } });
    workspace.ls.connection.sendRequest.mockResolvedValueOnce({ contents: { kind: "plaintext", value: "symbol" } });
    expect(await send("textDocument/hover", { textDocument: { uri: "file://local/main.sd" }, position: { line: 0, character: 1 } })).toMatchObject({ contents: { value: "symbol" } });
    for (const [method, handler] of [
      ["workspace/readFile", workspace.fs.readFile],
      ["workspace/readDirectoryFiles", workspace.fs.readDirectoryFiles],
      ["workspace/unzipFiles", workspace.fs.unzipFiles],
      ["workspace/willCreateFiles", workspace.fs.createFiles],
      ["workspace/willDeleteFiles", workspace.fs.deleteFiles],
    ] as const) {
      handler.mockResolvedValueOnce({ success: true });
      const params = { files: [], data: new Uint8Array([1, 2]).buffer };
      expect(await send(method, params)).toEqual({ success: true });
      expect(handler).toHaveBeenLastCalledWith(params);
    }
    workspace.fs.createFiles.mockRejectedValueOnce(new Error("quota"));
    await expect(send("workspace/willCreateFiles", { files: [] })).rejects.toThrow("quota");
    for (const [method, handler] of [
      ["workspace/willCreateFiles", workspace.fs.createFiles],
      ["workspace/willDeleteFiles", workspace.fs.deleteFiles],
    ] as const) {
      handler.mockRejectedValueOnce({ code: -32603, message: "storage is locked", data: { uri: "file://local/main.sd" } });
      await expect(send(method, { files: [] })).rejects.toMatchObject({ message: "storage is locked", code: -32603, data: { uri: "file://local/main.sd" } });
    }
  } finally {
    bridge.dispose();
    dispose();
  }
});
