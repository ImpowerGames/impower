import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";

vi.mock("../main/workers/workspace.worker", () => ({ default: "" }));

const { installWorkspaceWorker } = await import(
  "../main/workers/installWorkspaceWorker"
);
const { GamePlayerController, setWorkspace, whenControllerListening } =
  await import("../GamePlayerController");

class StandInWorker {
  postMessage() {}
  addEventListener() {}
  removeEventListener() {}
  terminate() {}
}

const g = globalThis as any;
const originals = { Worker: g.Worker, createObjectURL: URL.createObjectURL };

beforeEach(() => {
  g.Worker = StandInWorker;
  URL.createObjectURL = () => "blob:worker";
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
});

afterEach(() => {
  g.Worker = originals.Worker;
  URL.createObjectURL = originals.createObjectURL;
  vi.unstubAllGlobals();
  setWorkspace(undefined as any);
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

it("answers the editor's Initialize only once the player's controller is listening", async () => {
  const listeners: ((e: { data: unknown }) => void)[] = [];
  const answered: unknown[] = [];
  const connection = {
    addEventListener: (_type: string, listener: (e: { data: unknown }) => void) => {
      listeners.push(listener);
    },
    removeEventListener() {},
    sendResponse: async (_message: unknown, result: () => Promise<unknown>) => {
      answered.push(await result());
    },
    request: () => new Promise(() => {}),
    sendRequest: () => new Promise(() => {}),
  };
  const { workspace } = installWorkspaceWorker(
    connection as any,
    whenControllerListening(),
  );
  vi.spyOn(workspace, "initialize").mockResolvedValue(undefined as any);

  const initialize = InitializeMessage.type.request({
    processId: 0,
    rootUri: null,
    capabilities: {},
  } as any);
  for (const listener of [...listeners]) {
    listener({ data: initialize });
  }
  await settle();
  expect(workspace.initialize).toHaveBeenCalledTimes(1);
  expect(answered).toEqual([]);

  setWorkspace({ gameLink: { detach() {} }, programHeld: async () => {} } as any);
  const host = document.createElement("div");
  document.body.append(host);
  const controller: any = new GamePlayerController(host, {
    game: host,
    viewport: host,
  } as any);
  controller.updateSizeAndAspectRatioDisplay = () => {};
  try {
    controller.setup();
    await settle();
    expect(answered).toEqual([{ capabilities: {} }]);
  } finally {
    controller.dispose();
    host.remove();
  }
});
