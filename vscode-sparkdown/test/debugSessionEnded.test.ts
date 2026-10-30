import { describe, expect, it, vi } from "vitest";

vi.mock("../src/managers/SparkdownDebugManager", () => ({
  SparkdownDebugManager: { instance: {} },
}));

import { DidChangeGameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { GameEndedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEndedMessage";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GameReloadedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameReloadedMessage";
import { SparkDebugSession } from "../src/debugger/SparkDebugSession";

const launch = (launchState: "play" | "pause" | "ended" | "preview") =>
  DidChangeGameStateMessage.type.notification({
    mounted: true,
    programLoaded: true,
    programVersion: 1,
    launchState,
    position: null,
    completion: null,
  });

const location = (line: number) => ({
  uri: "file:///main.sd",
  range: {
    start: { line, character: 0 },
    end: { line, character: 4 },
  },
});

const session = (
  beforeReply: (method: string) => Promise<void> | void = () => {},
) => {
  const sent: { method: string; params: any }[] = [];
  const events: { event: string; body: any }[] = [];
  const connection = {
    connectInput() {},
    emit: async (message: { method: string; params: any }) => {
      sent.push(message);
      await beforeReply(message.method);
      if (message.method === "game/threads") {
        return { threads: [{ id: 0, name: "main" }] };
      }
      return {};
    },
  };
  const fileAccessor = {
    isWindows: false,
    uriToPath: (uri: string) => uri.replace("file://", ""),
    pathToUri: (path: string) => `file://${path}`,
    getRootPath: () => undefined,
  };
  const s = new SparkDebugSession(fileAccessor as any, connection as any);
  (s as any).sendEvent = (event: any) =>
    events.push({ event: event.event, body: event.body });
  (s as any).sendResponse = () => events.push({ event: "response", body: null });
  const notify = (message: any) => (s as any).onReceiveNotification(message);
  const restart = () => (s as any).restartRequest({ body: {} }, {});
  const request = (name: string) => (s as any)[name]({ body: {} }, {});
  return { notify, events, sent, restart, request };
};

describe("the debug adapter at the end of the story", () => {
  it("turns game/ended into a stop with reason end and keeps the session", async () => {
    const { notify, events } = await session();
    await notify(
      GameEndedMessage.type.notification({ kind: "out", location: location(3) }),
    );
    expect(events.map((e) => e.event)).toEqual(["stopped"]);
    expect(events[0]!.body).toEqual(
      expect.objectContaining({ reason: "end", threadId: 0 }),
    );
  });

  it("reports the error of an ending by error before the stop", async () => {
    const { notify, events } = await session();
    await notify(
      GameEndedMessage.type.notification({
        kind: "error",
        location: location(2),
        error: { message: "boom", location: location(2) },
      }),
    );
    expect(events.at(-1)!.event).toBe("stopped");
    expect(events.at(-1)!.body).toEqual(expect.objectContaining({ reason: "end" }));
    expect(
      events.some((e) => e.event === "output" && JSON.stringify(e.body).includes("boom")),
    ).toBe(true);
    expect(events.some((e) => e.event === "exited" || e.event === "terminated")).toBe(false);
  });

  it("reports the game running once the held run is torn down, before the replay's own stop", async () => {
    const { notify, events, sent, restart } = await session();
    await notify(launch("play"));
    await notify(
      GameEndedMessage.type.notification({ kind: "fin", location: location(1) }),
    );
    await notify(launch("ended"));
    await restart();
    expect(sent.map((m) => m.method)).toContain("game/restart");
    expect(events.map((e) => e.event)).toEqual(["stopped", "response"]);
    await notify(launch("preview"));
    await notify(launch("ended"));
    await notify(
      GameEndedMessage.type.notification({ kind: "fin", location: location(1) }),
    );
    expect(events.map((e) => [e.event, e.body?.reason ?? null])).toEqual([
      ["stopped", "end"],
      ["response", null],
      ["continued", null],
      ["stopped", "end"],
    ]);
    await notify(GameReloadedMessage.type.notification({}));
    expect(events).toHaveLength(4);
  });

  it("answers a step or continue on an ended run with the end stop, and sends the game nothing", async () => {
    const { notify, events, sent, request } = await session();
    await notify(launch("ended"));
    for (const name of [
      "nextRequest",
      "stepInRequest",
      "stepOutRequest",
      "continueRequest",
    ]) {
      events.length = 0;
      await request(name);
      expect(events.map((e) => [e.event, e.body?.reason ?? null])).toEqual([
        ["response", null],
        ["stopped", "end"],
      ]);
    }
    expect(sent.map((m) => m.method)).toEqual([
      "game/threads",
      "game/threads",
      "game/threads",
      "game/threads",
    ]);
    await notify(launch("play"));
    events.length = 0;
    await request("nextRequest");
    expect(sent.map((m) => m.method)).toContain("game/step");
  });

  it("answers a pause on an ended run with the end stop, and sends the game nothing", async () => {
    const { notify, events, sent, request } = await session();
    await notify(launch("ended"));
    await request("pauseRequest");
    expect(events.map((e) => [e.event, e.body?.reason ?? null])).toEqual([
      ["response", null],
      ["stopped", "end"],
    ]);
    expect(sent.map((m) => m.method)).toEqual(["game/threads"]);
  });

  it("undoes a pause the run ended during and reports the end, not a pause", async () => {
    let s: Awaited<ReturnType<typeof session>>;
    s = session(async (method) => {
      if (method === "game/pause") {
        await s.notify(launch("ended"));
      }
    });
    await s.notify(launch("play"));
    await s.request("pauseRequest");
    expect(s.sent.map((m) => m.method)).toEqual([
      "game/pause",
      "game/unpause",
      "game/threads",
    ]);
    expect(s.events.map((e) => [e.event, e.body?.reason ?? null])).toEqual([
      ["response", null],
      ["stopped", "end"],
    ]);
  });

  it("sends no continued event while launch states change without leaving an ended run", async () => {
    const { notify, events } = await session();
    await notify(launch("preview"));
    await notify(launch("play"));
    await notify(launch("pause"));
    await notify(launch("play"));
    await notify(launch("preview"));
    expect(events).toEqual([]);
  });

  it("still ends the session on game/exited", async () => {
    const { notify, events } = await session();
    await notify(GameExitedMessage.type.notification({ reason: "finished" }));
    expect(events.map((e) => e.event)).toEqual(["exited", "terminated"]);
  });
});
