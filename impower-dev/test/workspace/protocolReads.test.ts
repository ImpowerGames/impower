import { MessageProtocol, sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { expect, it } from "vitest";
import WorkspaceWindow from "../../src/modules/spark-editor/workspace/WorkspaceWindow";

const collaborators = {
  fs: { getLoadedProjectId: () => "loaded-project" },
} as unknown as ConstructorParameters<typeof WorkspaceWindow>[0];

const requestLoadedProject = async (id: string) => {
  const responses: unknown[] = [];
  const listener = (event: Event) => {
    const message = (event as CustomEvent).detail;
    if (message.id === id && "result" in message) responses.push(message.result);
  };
  window.addEventListener(MessageProtocol.event, listener);
  try {
    sendProtocolMessage({ jsonrpc: "2.0", id, method: "window/loadedProjectId", params: {} });
    await Promise.resolve();
    await Promise.resolve();
    return responses;
  } finally {
    window.removeEventListener(MessageProtocol.event, listener);
  }
};

it("answers the loaded project through the editor protocol", async () => {
  const win = new WorkspaceWindow(collaborators);
  try {
    expect(await requestLoadedProject("project-read")).toContainEqual({ id: "loaded-project" });
  } finally {
    win.dispose();
  }
});

it("stops answering protocol requests once disposed", async () => {
  const win = new WorkspaceWindow(collaborators);
  win.dispose();
  expect(await requestLoadedProject("disposed-read")).not.toContainEqual({ id: "loaded-project" });
});
