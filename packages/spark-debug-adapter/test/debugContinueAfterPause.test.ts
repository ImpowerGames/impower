import { describe, expect, it } from "vitest";

import { SparkDebugSession } from "../src/SparkDebugSession";

const session = () => {
  const sent: string[] = [];
  const debug = new SparkDebugSession(
    {
      isWindows: false,
      uriToPath: (uri: string) => uri,
      pathToUri: (path: string) => path,
      getRootPath: () => undefined,
    } as any,
    {
      connectInput() {},
      emit: async (message: { method: string }) => {
        sent.push(message.method);
        return { threads: [{ id: 0, name: "main" }] };
      },
    } as any,
    { syncCursorToExecution: false },
  );
  (debug as any).sendResponse = () => {};
  (debug as any).sendEvent = () => {};
  const response = (command: string) => ({
    seq: 0,
    type: "response",
    request_seq: 1,
    command,
    success: true,
  });
  const resumed = async () => {
    sent.length = 0;
    await (debug as any).continueRequest(response("continue"), { threadId: 0 });
    return [...sent];
  };
  return { debug, response, resumed };
};

describe("continuing a debug run", () => {
  it("sends the player one Resume after a pause", async () => {
    const { debug, response, resumed } = session();
    await (debug as any).pauseRequest(response("pause"), { threadId: 0 });
    expect(await resumed()).toEqual(["game/continue"]);
  });

  for (const traversal of ["nextRequest", "stepInRequest", "stepOutRequest"]) {
    it(`sends the player one Resume after ${traversal.replace("Request", "")}`, async () => {
      const { debug, response, resumed } = session();
      await (debug as any).pauseRequest(response("pause"), { threadId: 0 });
      await (debug as any)[traversal](response("step"), { threadId: 0 });
      await (debug as any).onReceiveNotification({
        jsonrpc: "2.0",
        method: "game/stepped",
        params: { location: { uri: "main.sd", range: {} } },
      });
      expect(await resumed()).toEqual(["game/continue"]);
    });
  }

  for (const traversal of ["nextRequest", "stepInRequest", "stepOutRequest"]) {
    it(`sends the player one Resume when it arrives before ${traversal.replace("Request", "")}'s stop is announced`, async () => {
      const { debug, response, resumed } = session();
      await (debug as any).pauseRequest(response("pause"), { threadId: 0 });
      await (debug as any)[traversal](response("step"), { threadId: 0 });
      expect(await resumed()).toEqual(["game/continue"]);
    });
  }

  const held = () => {
    const sent: string[] = [];
    const events: string[] = [];
    const responses: boolean[] = [];
    const gates = new Map<string, () => void>();
    const refused = new Set<string>();
    const holding = new Set<string>();
    const player = { paused: false, awaitingResume: false, advanced: 0 };
    const answer = (method: string) => {
      if (method === "game/pause") {
        player.paused = true;
      }
      if (method === "game/unpause") {
        player.paused = false;
      }
      if (method === "game/step") {
        player.awaitingResume = true;
      }
      if (method === "game/continue") {
        if (!player.paused || player.awaitingResume) {
          player.advanced += 1;
        }
        player.paused = false;
        player.awaitingResume = false;
      }
      return {
        threads: [{ id: 0, name: "main" }],
        stopped: player.paused || player.awaitingResume,
      };
    };
    const debug = new SparkDebugSession(
      {
        isWindows: false,
        uriToPath: (uri: string) => uri,
        pathToUri: (path: string) => path,
        getRootPath: () => undefined,
      } as any,
      {
        connectInput() {},
        emit: async (message: { method: string }) => {
          sent.push(message.method);
          const result = refused.has(message.method) ? undefined : answer(message.method);
          if (holding.has(message.method)) {
            await new Promise<void>((resolve) => gates.set(message.method, resolve));
          }
          if (!result) {
            throw { data: message.method, code: 1, message: "refused" };
          }
          return result;
        },
      } as any,
      { syncCursorToExecution: false },
    );
    (debug as any).sendResponse = (response: { success: boolean }) =>
      responses.push(response.success);
    (debug as any).sendEvent = (event: { event: string; body: { reason?: string } }) =>
      events.push(`${event.event}:${event.body?.reason ?? ""}`);
    const response = (command: string) => ({
      seq: 0,
      type: "response",
      request_seq: 1,
      command,
      success: true,
    });
    const until = async (method: string) => {
      while (!gates.has(method)) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    };
    const release = (method: string) => {
      holding.delete(method);
      gates.get(method)?.();
    };
    const pause = () => (debug as any).pauseRequest(response("pause"), { threadId: 0 });
    const resume = () => (debug as any).continueRequest(response("continue"), { threadId: 0 });
    const step = () => (debug as any).nextRequest(response("next"), { threadId: 0 });
    return {
      debug,
      player,
      sent,
      events,
      responses,
      refused,
      holding,
      until,
      release,
      pause,
      resume,
      step,
    };
  };

  it("keeps the beat on screen when Resume follows an acknowledged Pause", async () => {
    const h = held();
    await h.pause();
    await h.resume();
    expect(h.sent).not.toContain("game/unpause");
    expect(h.player.advanced).toBe(0);
    expect(h.player.paused).toBe(false);
    expect(h.responses).toEqual([true, true]);
  });

  it("drops a pause's stop whose stack answer is delayed past an accepted Resume", async () => {
    const h = held();
    h.holding.add("game/threads");
    const pausing = h.pause();
    await h.until("game/threads");
    await h.resume();
    h.release("game/threads");
    await pausing;
    expect(h.sent).not.toContain("game/unpause");
    expect(h.responses).toEqual([true, true]);
    expect(h.events).toEqual([]);
  });

  it("runs the story on when Resume follows an acknowledged Step, even after a later Pause", async () => {
    const h = held();
    await h.pause();
    await h.step();
    await h.pause();
    await h.resume();
    expect(h.sent).not.toContain("game/unpause");
    expect(h.player.advanced).toBe(1);
    expect(h.player.paused).toBe(false);
  });

  it("sends nothing more when the player refuses a Resume", async () => {
    const h = held();
    await h.pause();
    await h.step();
    h.sent.length = 0;
    h.refused.add("game/continue");
    await h.resume();
    expect(h.sent).toEqual(["game/continue"]);
    expect(h.responses.at(-1)).toBe(false);
    expect(h.player.paused).toBe(true);
  });

  it("still announces a pause's stop when the Resume that overtook it is refused", async () => {
    const h = held();
    h.holding.add("game/threads");
    const pausing = h.pause();
    await h.until("game/threads");
    h.refused.add("game/continue");
    await h.resume();
    h.release("game/threads");
    await pausing;
    expect(h.responses).toEqual([true, false]);
    expect(h.events).toEqual(["stopped:pause"]);
  });

  it("holds a pause's stop until a Resume in flight is answered, then drops it if accepted", async () => {
    const h = held();
    h.holding.add("game/threads");
    h.holding.add("game/continue");
    const pausing = h.pause();
    await h.until("game/threads");
    const resuming = h.resume();
    await h.until("game/continue");
    h.release("game/threads");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.events).toEqual([]);
    h.release("game/continue");
    await resuming;
    await pausing;
    expect(h.events).toEqual([]);
  });

  it("announces a stop that happens during a Resume", async () => {
    const h = held();
    await h.pause();
    await h.step();
    h.events.length = 0;
    h.holding.add("game/continue");
    const resuming = h.resume();
    await h.until("game/continue");
    h.player.awaitingResume = true;
    const stopping = (h.debug as any).onReceiveNotification({
      jsonrpc: "2.0",
      method: "game/hitBreakpoint",
      params: { location: { uri: "main.sd", range: {} } },
    });
    h.release("game/continue");
    await resuming;
    await stopping;
    expect(h.events).toEqual(["stopped:breakpoint"]);
  });

  it("sends the player one Resume after a breakpoint", async () => {
    const { debug, resumed } = session();
    await (debug as any).onReceiveNotification({
      jsonrpc: "2.0",
      method: "game/hitBreakpoint",
      params: { location: { uri: "main.sd", range: {} } },
    });
    expect(await resumed()).toEqual(["game/continue"]);
  });
});
