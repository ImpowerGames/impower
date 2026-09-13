import { MessageProtocol, sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { expect, it, vi } from "vitest";

vi.mock("../../src/modules/spark-editor/workspace/Workspace", () => ({
  Workspace: { fs: { getLoadedProjectId: () => "loaded-project" } },
}));

import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";

it("answers the loaded project through the editor protocol", async () => {
  new WorkspaceWindow();
  const responses: unknown[] = [];
  const listener = (event: Event) => {
    const message = (event as CustomEvent).detail;
    if (message.id === "project-read" && "result" in message) responses.push(message.result);
  };
  window.addEventListener(MessageProtocol.event, listener);
  try {
    sendProtocolMessage({ jsonrpc: "2.0", id: "project-read", method: "window/loadedProjectId", params: {} });
    await Promise.resolve();
    await Promise.resolve();
    expect(responses).toEqual([{ id: "loaded-project" }]);
  } finally {
    window.removeEventListener(MessageProtocol.event, listener);
  }
});
