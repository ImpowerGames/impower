import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { DidSelectTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidSelectTextDocumentMessage";
import { CompiledProgramMessage } from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { SelectedCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectedCompilerDocumentMessage";

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

const MAIN = "file:///local/main.sd";

it("compiles and answers the editor's Initialize only once the controller listens, so the first program and an early selection reach it", async () => {
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
  const deliver = (message: unknown) => {
    for (const listener of [...listeners]) {
      listener({ data: message });
    }
  };
  const { workspace } = installWorkspaceWorker(
    connection as any,
    whenControllerListening(),
  );
  setWorkspace(workspace);
  const program = { uri: MAIN, scripts: { [MAIN]: 1 } };
  vi.spyOn(workspace, "loadCompiler").mockResolvedValue(undefined as any);
  vi.spyOn(workspace, "compile").mockImplementation(async () => {
    await workspace.sendNotification(CompiledProgramMessage.method, {
      program,
    });
    return program as any;
  });
  vi.spyOn(workspace, "selectTextDocument").mockImplementation(
    async (params: any) => {
      await workspace.sendNotification(
        SelectedCompilerDocumentMessage.method,
        params,
      );
      return params;
    },
  );

  const host = document.createElement("div");
  document.body.append(host);
  const controller: any = new GamePlayerController(host, {
    game: host,
    viewport: host,
  } as any);
  const loaded = vi
    .spyOn(controller, "loadProgram")
    .mockResolvedValue(undefined);
  let setUp = false;
  try {
    deliver(
      InitializeMessage.type.request({
        processId: 0,
        rootUri: null,
        capabilities: {},
        initializationOptions: {
          settings: { scriptFiles: "**/*.sd" },
          uri: MAIN,
          files: [
            {
              uri: MAIN,
              src: MAIN,
              text: "First beat.\nSecond beat.",
              version: 1,
              languageId: "sparkdown",
            },
          ],
        },
      } as any),
    );
    await settle();
    expect(answered).toEqual([]);

    controller.setup();
    setUp = true;
    await settle();
    expect(answered).toEqual([{ capabilities: {} }]);
    expect(loaded).toHaveBeenCalledWith(program);

    deliver(
      DidSelectTextDocumentMessage.type.notification({
        textDocument: { uri: MAIN },
        selectedRange: {
          start: { line: 1, character: 0 },
          end: { line: 1, character: 0 },
        },
        docChanged: false,
        userEvent: true,
      } as any),
    );
    await settle();
    expect(controller._options?.startFrom).toEqual({ file: MAIN, line: 1 });
  } finally {
    if (setUp) {
      controller.dispose();
    }
    host.remove();
  }
});
