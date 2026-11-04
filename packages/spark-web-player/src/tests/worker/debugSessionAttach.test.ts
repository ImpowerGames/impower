import { describe, expect, it, vi } from "vitest";

vi.mock("../../../../../vscode-sparkdown/src/managers/SparkdownDebugManager", () => ({
  SparkdownDebugManager: { instance: { syncCursorToExecution: true } },
}));

import { GameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { GetGameThreadsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { SparkDebugSession } from "../../../../../vscode-sparkdown/src/debugger/SparkDebugSession";
import { createPlayerHarness, MAIN_URI, settle, writtenText } from "./playerHarness";

const SCRIPT = "scene start\n  First.\n  Second.\n  Third.\n  fin\nend\n";

describe("a VS Code debug session attached to PLAY in the worker", () => {
  for (const onStarted of [false, true]) {
    it(`stops on the next beat after a click when the session starts ${onStarted ? "on game/started" : "before RUN"}`, async () => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: SCRIPT }],
        startFrom: { file: MAIN_URI, line: 1 },
        manualClock: true,
      });
      const doc = h.overlay.ownerDocument;
      const win = doc.defaultView as any;
      win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
      h.refs.toolbar = doc.createElement("div");
      h.refs.playButton = doc.createElement("div");
      h.refs.playButton.getAnimations = () => [];
      const events: any[] = [];
      const pending: Promise<unknown>[] = [];
      let session: any;
      const attach = () => {
        session = new SparkDebugSession(
          {
            isWindows: false,
            uriToPath: (uri: string) => uri.replace("file://", ""),
            pathToUri: (path: string) => `file://${path}`,
            getRootPath: () => undefined,
            showFile: async () => {},
          } as any,
          {
            connectInput() {},
            emit: async (message: any) => {
              if (message.method === GameStateMessage.method) {
                return h.controller.getGameState();
              }
              expect(message.method).toBe(GetGameThreadsMessage.method);
              const answer = await h.controller.handleGetGameThreads(message);
              if (answer.error) {
                throw new Error(answer.error.message);
              }
              return answer.result;
            },
          } as any,
        );
        session.sendEvent = (event: any) => events.push(event);
        session.sendResponse = () => {};
        pending.push(session.launchRequest({}, {}));
      };
      const listener = (event: Event) => {
        const message = (event as CustomEvent).detail;
        if (onStarted && !session && message.method === "game/started") {
          attach();
        }
        if (session && !Object.hasOwn(message, "id")) {
          pending.push(session.onReceiveNotification(message));
        }
      };
      h.controller.host.addEventListener("jsonrpc", listener);
      try {
        await h.compile();
        await h.select(1);
        await settle(40);
        if (!onStarted) {
          attach();
        }
        await h.controller.handleClickPlayButton();
        await settle(40);
        await h.tick(1000 / 60, 60);
        await Promise.all(pending);
        expect(session).toBeTruthy();
        expect(h.controller.getGameState().launchState).toBe("play");
        expect(writtenText(h.toRouter)).toContain("First.");
        events.length = 0;
        const before = h.toRouter.length;
        h.controller._app.emit(
          EventMessage.type.notification({ type: "pointerdown", button: 0 } as never),
        );
        await settle(20);
        await h.tick(1000 / 60, 60);
        await Promise.all(pending);
        expect(writtenText(h.toRouter.slice(before))).toContain("Second.");
        expect(
          events.filter((e) => e.event === "stopped").map((e) => e.body.reason),
        ).toContain("awaiting interaction");
      } finally {
        h.controller.host.removeEventListener("jsonrpc", listener);
        await h.controller.destroyGameAndApp();
        h.dispose();
      }
    }, 120_000);
  }
});
