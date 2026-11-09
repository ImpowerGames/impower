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
