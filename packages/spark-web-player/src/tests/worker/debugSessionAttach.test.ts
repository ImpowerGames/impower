import { describe, expect, it } from "vitest";

import { GameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { EventMessage } from "@impower/spark-engine/src/game/core/classes/messages/EventMessage";
import { GetGameThreadsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { SparkDebugSession } from "../../../../spark-debug-adapter/src/SparkDebugSession";
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
          { syncCursorToExecution: true },
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
        await h.controller.run();
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

describe("a VS Code debug session attached to an ended PLAY run in the worker", () => {
  for (const selectionAt of ["none", "initialize", "read"] as const) {
    it(`stops on the end once when the selection moves ${selectionAt === "none" ? "nowhere" : `during ${selectionAt}`}`, async () => {
      const h = await createPlayerHarness({
        files: [{ uri: MAIN_URI, text: "scene start\n  fin\nend\n" }],
        startFrom: { file: MAIN_URI, line: 1 },
        manualClock: true,
      });
      const doc = h.overlay.ownerDocument;
      const win = doc.defaultView as any;
      win.requestAnimationFrame ??= (callback: () => void) => setTimeout(callback, 0);
      h.refs.toolbar = doc.createElement("div");
      const events: any[] = [];
      let stateRequest: any;
      const connection = new Connection({
        onSend(message: any) {
          if (message.method === GameStateMessage.method) {
            stateRequest = message;
          } else if (message.method === GetGameThreadsMessage.method) {
            void h.controller
              .handleGetGameThreads(message)
              .then((answer: any) => connection.receive(answer));
          } else {
            throw new Error(`Unexpected adapter request: ${message.method}`);
          }
        },
      });
      const listener = (event: Event) => {
        const message = (event as CustomEvent).detail;
        if (!Object.hasOwn(message, "id")) {
          connection.receive(message);
        }
      };
      try {
        await h.compile();
        await h.select(1);
        await settle(40);
        expect(await h.controller.startGameAndApp()).toBe(true);
        await settle(40);
        expect(h.controller.getGameState().launchState).toBe("ended");
        expect(
          h.toEditor.filter((message: any) => message.method === "game/ended"),
        ).toHaveLength(1);
        const session: any = new SparkDebugSession(
          {
            isWindows: false,
            showFile: async () => {},
            uriToPath: (uri: string) => uri,
            pathToUri: (path: string) => path,
            getRootPath: () => undefined,
          } as any,
          connection,
          { syncCursorToExecution: true },
        );
        session.sendEvent = (event: any) => events.push(event);
        session.sendResponse = () => {};
        h.controller.host.addEventListener("jsonrpc", listener);
        session.initializeRequest({ body: {} }, {});
        if (selectionAt === "initialize") {
          await h.select(0);
        }
        const launched = session.launchRequest({ body: {} }, { program: MAIN_URI });
        if (selectionAt === "read") {
          await h.select(0);
        }
        const answer = h.controller.getGameState();
        expect(answer.launchState).toBe("ended");
        connection.receive({
          jsonrpc: "2.0",
          method: stateRequest.method,
          id: stateRequest.id,
          result: answer,
        } as any);
        await launched;
        await settle(10);
        expect(
          events.filter((event) => event.event === "stopped").map((event) => event.body.reason),
        ).toEqual(["end"]);
      } finally {
        h.controller.host.removeEventListener("jsonrpc", listener);
        await h.controller.destroyGameAndApp();
        h.dispose();
      }
    }, 120_000);
  }
});
