import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";

const connection = vi.hoisted(() => ({
  notifications: new Map<string, (params: unknown) => void>(),
}));
vi.mock("vscode-jsonrpc/browser", () => ({
  BrowserMessageReader: class {},
  BrowserMessageWriter: class {},
  createMessageConnection: () => ({
    onRequest: () => {},
    onNotification: (method: string, handler: (params: unknown) => void) => {
      connection.notifications.set(method, handler);
    },
    onClose: () => {},
    listen: () => {},
  }),
}));
vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: {
    fs: {
      writeProjectMetadata: vi.fn(),
      getFileUri: (projectId: string, filename: string) => `file://${projectId}/${filename}`,
      getFilename: (uri: string) => uri.split("/").slice(-1).join(""),
      getRelativePath: (_projectId: string, uri: string) => uri.split("/").slice(-1).join(""),
    },
  },
}));
vi.mock("@impower/jsonrpc/src/browser/classes/IFrameMessageConnection", () => ({
  IFrameMessageConnection: class {},
}));
vi.mock("@impower/jsonrpc/src/browser/classes/Port1MessageConnection", () => ({
  Port1MessageConnection: class {
    async connect() {}
    addEventListener() {}
    removeEventListener() {}
    postMessage() {}
    async sendRequest() {
      return {};
    }
    sendResponse() {}
  },
}));

import { Workspace } from "../../src/modules/spark-editor/workspace/Workspace";
import WorkspaceConfiguration from "../../src/modules/spark-editor/workspace/WorkspaceConfiguration";
import WorkspaceLanguageServer from "../../src/modules/spark-editor/workspace/WorkspaceLanguageServer";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";
import workspace from "../../src/modules/spark-editor/workspace/WorkspaceStore";
import { useDiagnosticColor } from "../../src/modules/spark-editor/workspace/useDiagnosticColor";

const MAIN = "file://proj/main.sd";
const ARTWORK = "file://proj/styled.svg";
const bakeError = {
  severity: 1,
  code: "morph-unsupported-element",
  message: "Morph `blink` on styled.svg: unsupported element <style>",
  range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
};
const unusedWarning = { ...bakeError, severity: 2, code: "unused", message: "Unused asset" };

function Row({ filename }: { filename?: string }) {
  return h("span", { class: useDiagnosticColor(filename) }, filename);
}

describe("asset rows coloured from the language server's published diagnostics", () => {
  let win: WorkspaceWindow;
  let host: HTMLDivElement;

  const row = () => host.querySelector("span")!.getAttribute("class") ?? "";

  const compiled = () =>
    act(() => {
      sendProtocolMessage(
        CompiledProgramMessage.type.notification({
          textDocument: { uri: MAIN, version: 1 },
          program: { uri: MAIN, scripts: { [MAIN]: 1 }, files: {} } as any,
        }),
      );
    });

  const published = (uri: string, diagnostics: unknown[]) =>
    act(() => {
      connection.notifications.get("textDocument/publishDiagnostics")?.({ uri, diagnostics });
    });

  beforeEach(() => {
    connection.notifications.clear();
    workspace.current = { ...workspace.current, debug: {} };
    vi.stubGlobal(
      "Worker",
      class {
        onerror: unknown;
        addEventListener() {}
        postMessage() {}
      },
    );
    win = new WorkspaceWindow(Workspace as any);
    new WorkspaceLanguageServer({ configuration: new WorkspaceConfiguration(), window: win });
    host = document.createElement("div");
    document.body.append(host);
    act(() => render(h(Row, { filename: "styled.svg" }), host));
  });

  afterEach(() => {
    act(() => render(null, host));
    host.remove();
    win.dispose();
    vi.unstubAllGlobals();
  });

  it("colours a row for a morph bake error that only the language server reports", () => {
    compiled();
    published(ARTWORK, [bakeError]);
    expect(row()).toBe("text-error-strong");
  });

  it("keeps the colour when a later compile is relayed", () => {
    compiled();
    published(ARTWORK, [bakeError]);
    compiled();
    expect(row()).toBe("text-error-strong");
  });

  it("follows a bake that finishes after the compile, then clears when the problem is fixed", () => {
    compiled();
    expect(row()).toBe("");
    published(ARTWORK, [unusedWarning]);
    expect(row()).toBe("text-warning-strong");
    published(ARTWORK, [unusedWarning, bakeError]);
    expect(row()).toBe("text-error-strong");
    published(ARTWORK, []);
    expect(row()).toBe("");
  });

  it("colours the Scripts tab for a script's problem but not for an asset's", () => {
    act(() => render(h(Row, {}), host));
    published(ARTWORK, [bakeError]);
    published(MAIN, [bakeError]);
    expect(row()).toBe("");
    published("file://proj/scripts/util.luau", [unusedWarning]);
    expect(row()).toBe("text-warning-strong");
  });
});
