import { describe, expect, it } from "vitest";

import { SparkDebugSession } from "../src/SparkDebugSession";

const NOTHING_BEFORE = "Nothing to go back to.";

const moved = (beat: number, held: boolean, run = 1) => ({
  moved: true,
  restored: { beat, location: { uri: "main.sd", range: {} } },
  history: {},
  held,
  run,
});

const session = (answers: Record<string, unknown> = {}) => {
  const sent: { method: string; params: unknown }[] = [];
  const events: { event: string; body?: any }[] = [];
  const responses: any[] = [];
  const debug: any = new SparkDebugSession(
    {
      isWindows: false,
      uriToPath: (uri: string) => uri,
      pathToUri: (path: string) => path,
      getRootPath: () => undefined,
    } as any,
    {
      connectInput() {},
      emit: async (message: { method: string; params: unknown }) => {
        sent.push({ method: message.method, params: message.params });
        if (message.method === "game/threads") {
          return { threads: [{ id: 0, name: "main" }], stopped: true, run: 1 };
        }
        return answers[message.method] ?? moved(0, true);
      },
    } as any,
    { syncCursorToExecution: false },
  );
  debug.sendResponse = (response: any) => responses.push(response);
  debug.sendEvent = (event: any) => events.push(event);
  const following = () =>
    debug.onReceiveNotification({
      jsonrpc: "2.0",
      method: "preview/didChangeGameState",
      params: { launchState: "pause", run: 1 },
    });
  const response = (command: string) => ({
    seq: 0,
    type: "response",
    request_seq: 1,
    command,
    success: true,
  });
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const requests = () => sent.filter((m) => m.method !== "game/threads");
  const stops = () =>
    events.filter((e) => e.event === "stopped").map((e) => e.body.reason);
  return { debug, following, response, responses, settle, requests, stops };
};

describe("rolling a debug run back and forward", () => {
  it("offers Step Back in its capabilities", () => {
    const { debug, response, responses } = session();
    debug.initializeRequest(response("initialize"), {});
    expect(responses[0].body.supportsStepBack).toBe(true);
  });

  it("asks for one held roll back one beat on Step Back, and stops at the restored beat when the run stays held", async () => {
    const { debug, following, response, responses, requests, stops } = session();
    await following();
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(requests()).toEqual([
      { method: "game/rollBack", params: { to: "beat", hold: true } },
    ]);
    expect(responses.map((r) => [r.success, r.body])).toEqual([[true, { moved: true }]]);
    expect(stops()).toEqual(["step"]);
  });

  it("asks for one held roll back to the last beat a breakpoint held on Reverse Continue", async () => {
    const { debug, following, response, requests, stops } = session();
    await following();
    await debug.reverseContinueRequest(response("reverseContinue"), {
      threadId: 0,
    });
    expect(requests()).toEqual([
      { method: "game/rollBack", params: { to: "breakpoint", hold: true } },
    ]);
    expect(stops()).toEqual(["step"]);
  });

  it("carries the bar's Skip and Shift+Skip as sparkdown/rollBack and sparkdown/rollForward", async () => {
    const { debug, response, responses, settle, requests } = session({
      "game/rollBack": moved(0, false),
      "game/rollForward": moved(1, false),
    });
    debug.customRequest("sparkdown/rollBack", response("sparkdown/rollBack"), {
      to: "choice",
    });
    await settle();
    debug.customRequest(
      "sparkdown/rollForward",
      response("sparkdown/rollForward"),
      { to: "beat" },
    );
    await settle();
    expect(requests()).toEqual([
      { method: "game/rollBack", params: { to: "choice", hold: true } },
      { method: "game/rollForward", params: { to: "beat", hold: true } },
    ]);
    expect(responses.map((r) => [r.command, r.success, r.body])).toEqual([
      ["sparkdown/rollBack", true, { moved: true }],
      ["sparkdown/rollForward", true, { moved: true }],
    ]);
  });

  it("carries a named choice in one sparkdown/rollBack, and answers a choice the run no longer holds with its reason", async () => {
    const GONE = "That choice is no longer in this run.";
    const { debug, response, responses, settle, requests } = session({
      "game/rollBack": { moved: false, reason: GONE, history: {}, held: false },
    });
    debug.customRequest("sparkdown/rollBack", response("sparkdown/rollBack"), {
      to: "choice",
      choice: 4,
    });
    await settle();
    expect(requests()).toEqual([
      { method: "game/rollBack", params: { to: "choice", choice: 4, hold: true } },
    ]);
    expect(responses.map((r) => [r.success, r.message])).toEqual([[false, GONE]]);
  });

  it("answers a roll the run refuses with its reason, and does not stop", async () => {
    const { debug, following, response, responses, stops } = session({
      "game/rollBack": { moved: false, reason: NOTHING_BEFORE, history: {}, held: false },
    });
    await following();
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(responses.map((r) => [r.success, r.message])).toEqual([
      [false, NOTHING_BEFORE],
    ]);
    expect(stops()).toEqual([]);
  });

  it("answers a roll a later one superseded without a refusal", async () => {
    const { debug, response, responses, settle } = session({
      "game/rollBack": { moved: false, superseded: true, history: {}, held: false },
    });
    debug.customRequest("sparkdown/rollBack", response("sparkdown/rollBack"), {
      to: "beat",
    });
    await settle();
    expect(responses.map((r) => [r.success, r.body])).toEqual([
      [true, { moved: false }],
    ]);
  });

  it("does not stop a playing run that a roll moved", async () => {
    const { debug, following, response, stops } = session({
      "game/rollBack": moved(0, false),
    });
    await following();
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(stops()).toEqual([]);
  });

  it("does not stop the run it follows for a roll held for an earlier run", async () => {
    const { debug, following, response, stops } = session({
      "game/rollBack": moved(0, true, 0),
    });
    await following();
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(stops()).toEqual([]);
  });

  it("does not stop on the engine's roll notification", async () => {
    const { debug, following, stops } = session();
    await following();
    await debug.onReceiveNotification({
      jsonrpc: "2.0",
      method: "game/rolled",
      params: moved(1, true),
    });
    expect(stops()).toEqual([]);
  });
});
