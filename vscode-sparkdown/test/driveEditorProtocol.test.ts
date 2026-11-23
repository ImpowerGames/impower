import * as vscode from "vscode";
import type { LanguageClient } from "vscode-languageclient/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { attachDriveEditorProtocol, createDriveEditorProtocol } from "../src/utils/driveEditorProtocol";
import { document, Position, Selection } from "./fakeVscode";

const host = vi.hoisted(() => ({
  active: undefined as unknown,
  changes: new Set<(editor: unknown) => void>(),
  show: vi.fn(),
}));

vi.mock("vscode", async () => {
  const { Position, Range, Selection } = await import("./fakeVscode");
  return {
    Position,
    Range,
    Selection,
    ExtensionMode: { Production: 1, Development: 2 },
    TextEditorRevealType: { Default: 0, InCenter: 1, AtTop: 3 },
    CancellationTokenSource: class {
      readonly token = { isCancellationRequested: false };
      cancel() { this.token.isCancellationRequested = true; }
      dispose() {}
    },
    window: {
      get activeTextEditor() { return host.active; },
      onDidChangeActiveTextEditor(listener: (editor: unknown) => void) {
        host.changes.add(listener);
        return { dispose: () => host.changes.delete(listener) };
      },
      showTextDocument: host.show,
    },
  };
});

const uri = "vscode-test-web://mount/main.sd";
const text = "scene START\r\n\t😀 café\r\nend";
const origin = new Position(0, 0);
const createEditor = (name = uri, version = 7) => ({
  document: {
    ...document(name, text, version),
    validatePosition: (p: Position) => p.line < 3 ? p : new Position(2, 0),
  },
  selection: new Selection(origin, origin),
  revealRange: vi.fn(),
  viewColumn: 1,
});

function changeActive(editor: unknown) {
  host.active = editor;
  for (const listener of host.changes) listener(editor);
}

function setup() {
  const editor = createEditor();
  changeActive(editor);
  const initialized = Promise.withResolvers<LanguageClient>();
  const send = vi.fn();
  const request = vi.fn();
  const client = {
    isRunning: () => true,
    code2ProtocolConverter: { asUri: (value: vscode.Uri) => value.toString() },
    sendRequest: request,
  } as unknown as LanguageClient;
  const adapter = createDriveEditorProtocol(initialized.promise, send);
  const diagnostics = (id: number, version = 7) => adapter.receive({
    id, method: "textDocument/diagnosticsSettled", params: { textDocument: { uri } }, version,
  });
  return { editor, adapter, initialized, request, send, client, diagnostics };
}

afterEach(() => {
  host.changes.clear();
  host.active = undefined;
  host.show.mockClear();
  vi.unstubAllGlobals();
});

describe("the development editor protocol adapter", () => {
  it("reads the actual active text and selection and reveals a requested UTF-16 caret", async () => {
    const { adapter, editor, send, request } = setup();
    expect(send).toHaveBeenCalledWith({ method: "editor/didLoad", params: { textDocument: { uri, version: 7 } } });
    await adapter.receive({ id: 1, method: "editor/read", params: { textDocument: { uri } }, version: 7 });
    expect(send).toHaveBeenLastCalledWith({
      id: 1, result: { textDocument: { uri, version: 7, text }, selection: { start: origin, end: origin }, coordinates: null },
    });
    const at = { line: 1, character: 4 };
    await adapter.receive({
      id: 2, method: "editor/select", version: 7, notification: true,
      params: { textDocument: { uri }, range: { start: at, end: at }, takeFocus: true, scrollIntoView: "center" },
    });
    expect(host.show).toHaveBeenCalledWith(editor.document, { viewColumn: 1, preserveFocus: false });
    expect(editor.selection.start).toEqual(at);
    expect(editor.revealRange).toHaveBeenCalledWith(expect.objectContaining({ start: at, end: at }), vscode.TextEditorRevealType.InCenter);
    expect(request).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it("waits for client start and emits only a full report at the exact requested document version", async () => {
    const { adapter, initialized, request, send, client, diagnostics } = setup();
    request.mockResolvedValueOnce({ kind: "full", resultId: "7", items: [] });
    const pending = diagnostics(1);
    expect(request).not.toHaveBeenCalled();
    initialized.resolve(client);
    await pending;
    expect(request).toHaveBeenCalledWith("textDocument/diagnostic", { textDocument: { uri } }, expect.any(Object));
    const result = { uri, version: 7, diagnostics: [] };
    expect(send).toHaveBeenCalledWith({ method: "textDocument/didSettleDiagnostics", params: result });
    expect(send).toHaveBeenLastCalledWith({ id: 1, result });
    send.mockClear();
    request.mockResolvedValueOnce({ kind: "full", resultId: "6", items: [] });
    await diagnostics(2);
    expect(send.mock.calls).toEqual([[{ id: 2, error: expect.stringMatching(/full diagnostics for version 7/) }]]);
    adapter.dispose();
  });

  it("rejects a switch away and back during a request and ignores a cancelled hover response", async () => {
    const { adapter, editor, initialized, request, send, client, diagnostics } = setup();
    const server = Promise.withResolvers<unknown>();
    initialized.resolve(client);
    request.mockReturnValueOnce(server.promise);
    const pending = diagnostics(1);
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    changeActive(createEditor("vscode-test-web://mount/nested/main.sd"));
    changeActive(editor);
    server.resolve({ kind: "full", resultId: "7", items: [] });
    await pending;
    expect(send).toHaveBeenLastCalledWith({ id: 1, error: expect.stringMatching(/changed during request/) });
    const hover = Promise.withResolvers<unknown>();
    request.mockReturnValueOnce(hover.promise);
    const cancelled = adapter.receive({
      id: 2, method: "textDocument/hover", version: 7,
      params: { textDocument: { uri }, position: { line: 1, character: 4 } },
    });
    await Promise.resolve();
    expect(request).toHaveBeenLastCalledWith("textDocument/hover", {
      textDocument: { uri }, position: { line: 1, character: 4 },
    }, expect.any(Object));
    await adapter.receive({ cancel: 2 });
    hover.resolve({ contents: "old hover" });
    await cancelled;
    expect(send).not.toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
    adapter.dispose();
    expect(host.changes.size).toBe(0);
  });

  it("refuses an arbitrary command and never installs the transport in production mode", async () => {
    const { adapter, initialized, request, send } = setup();
    await adapter.receive({ id: 1, method: "workspace/executeCommand" });
    expect(send).toHaveBeenLastCalledWith({ id: 1, error: "unsupported editor protocol method" });
    expect(request).not.toHaveBeenCalled();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await attachDriveEditorProtocol({ extensionMode: vscode.ExtensionMode.Production } as never, initialized.promise);
    expect(fetch).not.toHaveBeenCalled();
    adapter.dispose();
  });
});
