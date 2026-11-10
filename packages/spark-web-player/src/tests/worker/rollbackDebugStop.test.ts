import { describe, expect, it } from "vitest";

import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { ContinueGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ContinueGameMessage";
import { GetGameThreadsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { PauseGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import { StepGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameMessage";
import { SparkDebugSession } from "../../../../spark-debug-adapter/src/SparkDebugSession";
import { createPlayerHarness, MAIN_URI, settle } from "./playerHarness";

const SOURCE = [
  "store mood = 0",
  "scene start",
  "  First.",
  "  mood = 1",
  "  Second.",
  "  mood = 2",
  "  Third.",
  "  mood = 3",
  "  Fourth.",
  "end",
].join("\n");

const SECOND_WRITE = SOURCE.split("\n").findIndex((l) => l.includes("mood = 2"));

const playing = async () => {
  const h = await createPlayerHarness({
    files: [{ uri: MAIN_URI, text: SOURCE }],
    startFrom: { file: MAIN_URI, line: 2 },
    manualClock: true,
  });
  const c = h.controller as any;
  await h.compile();
  await h.select(2);
  await settle(30);
  expect(await c.startGameAndApp()).toBe(true);
  await settle(30);
  await h.tick(1000 / 60, 30);
  const onward = async () => {
    await c.handleContinueGame(ContinueGameMessage.type.request({}));
    await settle(10);
    await h.tick(1000 / 60, 20);
  };
  await onward();
  return { h, c, onward };
};

const attach = (c: any) => {
  const handlers: Record<string, string> = {
    "game/rollBack": "handleRollBackGame",
    "game/rollForward": "handleRollForwardGame",
    "game/threads": "handleGetGameThreads",
    "game/pause": "handlePauseGame",
  };
  const connection = new Connection({
    onSend: (m: any) => {
      if ("id" in m) {
        const handler = handlers[m.method];
        if (!handler) {
          throw new Error(`Unhandled ${m.method}`);
        }
        void Promise.resolve(c[handler](m)).then((r) => connection.receive(r));
      }
    },
  });
  const debug = new SparkDebugSession(
    {
      isWindows: false,
      uriToPath: (uri: string) => uri,
      pathToUri: (path: string) => path,
      getRootPath: () => undefined,
    } as any,
    connection,
    { syncCursorToExecution: false },
  ) as any;
  const events: any[] = [];
  const responses: any[] = [];
  debug.sendEvent = (e: any) => events.push(e);
  debug.sendResponse = (r: any) => responses.push(r);
  const listen = (e: any) => {
    const m = e.detail;
    if (!("id" in m)) {
      connection.receive(m);
    }
  };
  c.host.addEventListener("jsonrpc", listen);
  connection.receive({
    jsonrpc: "2.0",
    method: "preview/didChangeGameState",
    params: c.getGameState(),
  } as any);
  const stops = () =>
    events.filter((e) => e.event === "stopped").map((e) => e.body.reason);
  return {
    debug,
    responses,
    stops,
    dispose: () => c.host.removeEventListener("jsonrpc", listen),
  };
};

const request = (command: string) => ({
  seq: 0,
  type: "response",
  request_seq: 1,
  command,
  success: true,
});

describe("a roll of a run the debugger holds", () => {
  const HOLDS = [
    ["pause", "a pause"],
    ["step", "a step"],
    ["breakpoint", "a breakpoint"],
    ["end", "the end"],
  ] as const;
  for (const [held, name] of HOLDS) {
    it(`stops at the restored beat after Step Back from ${name}, and keeps the run held`, async () => {
      const { h, c, onward } = await playing();
      let session: ReturnType<typeof attach> | undefined;
      try {
        if (held === "pause") {
          await c.handlePauseGame(PauseGameMessage.type.request({}));
        } else if (held === "step") {
          await c.handleStepGame(StepGameMessage.type.request({ traversal: "in" }));
        } else if (held === "breakpoint") {
          h.playing()!.setBreakpoints([{ file: MAIN_URI, line: SECOND_WRITE }]);
          await onward();
          expect(h.toEditor.some((m: any) => m.method === "game/hitBreakpoint")).toBe(true);
        } else {
          for (let i = 0; i < 5 && c.getGameState().launchState !== "ended"; i += 1) {
            await onward();
          }
          expect(c.getGameState().launchState).toBe("ended");
        }
        session = attach(c);
        await session.debug.stepBackRequest(request("stepBack"), { threadId: 0 });
        await settle(40);
        expect(session.responses[0]).toMatchObject({ success: true, body: { moved: true } });
        expect(session.stops()).toEqual(["step"]);
        const threads = await c.handleGetGameThreads(GetGameThreadsMessage.type.request({}));
        expect(threads.result.stopped).toBe(true);
        expect(c.getGameState()).toMatchObject({ launchState: "pause", paused: true });
      } finally {
        session?.dispose();
        h.dispose();
      }
    }, 120_000);
  }

  it("rolls a playing run without stopping or pausing it", async () => {
    const { h, c, onward } = await playing();
    let session: ReturnType<typeof attach> | undefined;
    try {
      await onward();
      session = attach(c);
      session.debug.customRequest("sparkdown/rollBack", request("sparkdown/rollBack"), {
        to: "beat",
      });
      await settle(40);
      expect(session.responses[0]).toMatchObject({ success: true, body: { moved: true } });
      expect(session.stops()).toEqual([]);
      expect(c.getGameState()).toMatchObject({ launchState: "play", paused: false });
    } finally {
      session?.dispose();
      h.dispose();
    }
  }, 120_000);
});
