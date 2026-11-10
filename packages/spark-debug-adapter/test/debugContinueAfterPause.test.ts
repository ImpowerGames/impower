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
  it("resumes in place after a pause, without advancing past the beat on screen", async () => {
    const { debug, response, resumed } = session();
    await (debug as any).pauseRequest(response("pause"), { threadId: 0 });
    expect(await resumed()).toEqual(["game/unpause"]);
  });

  for (const traversal of ["nextRequest", "stepInRequest", "stepOutRequest"]) {
    it(`runs on to the next stop after ${traversal.replace("Request", "")}`, async () => {
      const { debug, response, resumed } = session();
      await (debug as any).pauseRequest(response("pause"), { threadId: 0 });
      await (debug as any)[traversal](response("step"), { threadId: 0 });
      await (debug as any).onReceiveNotification({
        jsonrpc: "2.0",
        method: "game/stepped",
        params: { location: { uri: "main.sd", range: {} } },
      });
      expect(await resumed()).toEqual(["game/unpause", "game/continue"]);
    });
  }

  for (const traversal of ["nextRequest", "stepInRequest", "stepOutRequest"]) {
    it(`runs on to the next stop when Resume arrives before ${traversal.replace("Request", "")}'s stop is announced`, async () => {
      const { debug, response, resumed } = session();
      await (debug as any).pauseRequest(response("pause"), { threadId: 0 });
      await (debug as any)[traversal](response("step"), { threadId: 0 });
      expect(await resumed()).toEqual(["game/unpause", "game/continue"]);
    });
  }

  it("resumes in place when Resume arrives before the pause's stop is announced", async () => {
    const sent: string[] = [];
    const events: string[] = [];
    let answerThreads: (value: unknown) => void = () => {};
    const debug = new SparkDebugSession(
      {
        isWindows: false,
        uriToPath: (uri: string) => uri,
        pathToUri: (path: string) => path,
        getRootPath: () => undefined,
      } as any,
      {
        connectInput() {},
        emit: (message: { method: string }) => {
          sent.push(message.method);
          return message.method === "game/threads"
            ? new Promise((resolve) => {
                answerThreads = resolve;
              })
            : Promise.resolve({});
        },
      } as any,
      { syncCursorToExecution: false },
    );
    const acknowledged = new Promise<void>((resolve) => {
      (debug as any).sendResponse = () => resolve();
    });
    (debug as any).sendEvent = (event: { event: string }) => events.push(event.event);
    const response = (command: string) => ({
      seq: 0,
      type: "response",
      request_seq: 1,
      command,
      success: true,
    });
    const pausing = (debug as any).pauseRequest(response("pause"), { threadId: 0 });
    await acknowledged;
    await (debug as any).continueRequest(response("continue"), { threadId: 0 });
    answerThreads({ threads: [{ id: 0, name: "main" }] });
    await pausing;
    expect(sent).not.toContain("game/continue");
    expect(events).not.toContain("stopped");
  });

  const held = () => {
    const sent: string[] = [];
    const events: string[] = [];
    const responses: boolean[] = [];
    const gates = new Map<string, () => void>();
    const refused = new Set<string>();
    const holding = new Set<string>();
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
          if (holding.has(message.method)) {
            await new Promise<void>((resolve) => gates.set(message.method, resolve));
          }
          if (refused.has(message.method)) {
            throw { data: message.method, code: 1, message: "refused" };
          }
          return { threads: [{ id: 0, name: "main" }] };
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
    return { debug, sent, events, responses, refused, holding, until, release, pause, resume, step };
  };

  it("pauses the player again when Continue is refused after Unpause succeeded", async () => {
    const h = held();
    await h.pause();
    await h.step();
    h.sent.length = 0;
    h.refused.add("game/continue");
    await h.resume();
    expect(h.sent).toEqual(["game/unpause", "game/continue", "game/pause"]);
    expect(h.responses.at(-1)).toBe(false);
  });

  it("does not pause the player again when Unpause itself is refused", async () => {
    const h = held();
    await h.pause();
    h.sent.length = 0;
    h.refused.add("game/unpause");
    await h.resume();
    expect(h.sent).toEqual(["game/unpause"]);
  });

  it("still announces a pause's stop when the Resume that overtook it is refused", async () => {
    const h = held();
    h.holding.add("game/threads");
    const pausing = h.pause();
    await h.until("game/threads");
    h.refused.add("game/unpause");
    await h.resume();
    h.release("game/threads");
    await pausing;
    expect(h.responses).toEqual([true, false]);
    expect(h.events).toEqual(["stopped:pause"]);
  });

  it("holds a pause's stop until a Resume in flight is answered, then drops it if accepted", async () => {
    const h = held();
    h.holding.add("game/threads");
    h.holding.add("game/unpause");
    const pausing = h.pause();
    await h.until("game/threads");
    const resuming = h.resume();
    await h.until("game/unpause");
    h.release("game/threads");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.events).toEqual([]);
    h.release("game/unpause");
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

    it("runs on to the next stop after a breakpoint", async () => {
    const { debug, resumed } = session();
    await (debug as any).onReceiveNotification({
      jsonrpc: "2.0",
      method: "game/hitBreakpoint",
      params: { location: { uri: "main.sd", range: {} } },
    });
    expect(await resumed()).toEqual(["game/unpause", "game/continue"]);
  });
});
