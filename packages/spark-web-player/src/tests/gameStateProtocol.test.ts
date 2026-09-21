import { afterEach, expect, it, vi } from "vitest";
import { GamePlayerController, setWorkspace } from "../GamePlayerController";
import { GameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { MessageProtocol, sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";

afterEach(() => {
  vi.unstubAllGlobals();
  setWorkspace(undefined as any);
});

// With the worker displaying the preview (#680), the page is handed each
// program's summary, which reports the same state.
for (const worker of [false, true]) {
  it(`reports mounted, loaded, paused and disposed states from the player lifecycle (${worker ? "the worker" : "the page"} displaying)`, async () => {
    vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
    if (worker) {
      setWorkspace({ workerDisplaysPreview: true, gameLink: { detach() {} } } as any);
    }
    const host = document.createElement("div");
    document.body.append(host);
    const refs: any = { game: host, viewport: host };
    const controller: any = new GamePlayerController(host, refs);
    controller.updateSizeAndAspectRatioDisplay = () => {};
    expect(controller.getGameState().mounted).toBe(false);
    controller.setup();
    try {
      expect(controller.getGameState()).toMatchObject({ mounted: true, programLoaded: false, launchState: null });
      const program = worker
        ? { uri: "file://local/main.sd", version: 4, files: {}, scripts: {}, summary: true, runnable: true }
        : { uri: "file://local/main.sd", version: 4, compiled: {}, scripts: {} };
      await controller.loadProgram(program, undefined);
      expect(controller.getGameState()).toMatchObject({ mounted: true, programLoaded: true, programVersion: 4, launchState: "preview" });
      controller._app = { paused: true };
      controller.updateLaunchStateIcon();
      const request = GameStateMessage.type.request({});
      const response = new Promise<any>((resolve) => {
        const receive = (event: Event) => {
          const message = (event as CustomEvent).detail;
          if (GameStateMessage.type.isResponse(message, request.id)) {
            window.removeEventListener(MessageProtocol.event, receive);
            resolve(message.result);
          }
        };
        window.addEventListener(MessageProtocol.event, receive);
      });
      sendProtocolMessage(request);
      expect(await response).toMatchObject({ launchState: "pause", programVersion: 4 });
    } finally {
      controller._app = undefined;
      controller.dispose();
      host.remove();
    }
    expect(controller.getGameState()).toMatchObject({ mounted: false, programLoaded: false, launchState: null });
  });
}
