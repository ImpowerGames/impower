import { describe, expect, it } from "vitest";

import { SparkDebugSession } from "../src/SparkDebugSession";

const NOTHING_BEFORE = "Nothing to go back to.";

const moved = (beat: number) => ({
  moved: true,
  restored: { beat, location: { uri: "main.sd", range: {} } },
  history: {},
});

const session = (
  rolls: Record<string, unknown> = {},
  player = { stopped: true, ended: false },
) => {
  const sent: { method: string; params: unknown }[] = [];
  const events: { event: string; body?: any }[] = [];
  const responses: any[] = [];
  let debug: any;
  const state = (launchState: string) =>
    debug.onReceiveNotification({
      jsonrpc: "2.0",
      method: "preview/didChangeGameState",
      params: { launchState, run: 1 },
    });
  debug = new SparkDebugSession(
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
          return { threads: [{ id: 0, name: "main" }], stopped: player.stopped, run: 1 };
        }
        if (message.method === "game/pause") {
          player.stopped = true;
          await state("pause");
          return { run: 1 };
        }
        const answer = rolls[message.method] ?? moved(0);
        if (player.ended && (answer as { moved: boolean }).moved) {
          player.ended = false;
          await state("play");
        }
        return answer;
      },
    } as any,
    { syncCursorToExecution: false },
  );
  debug.sendResponse = (response: any) => responses.push(response);
  debug.sendEvent = (event: any) => events.push(event);
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
  const methods = () =>
    sent.map((m) => m.method).filter((m) => m !== "game/threads");
  const rolls_ = () =>
    sent.filter((m) => m.method === "game/rollBack" || m.method === "game/rollForward");
  const stops = () =>
    events.filter((e) => e.event === "stopped").map((e) => e.body.reason);
  return { debug, state, response, responses, settle, methods, rolls: rolls_, stops };
};

describe("rolling a debug run back and forward", () => {
  it("offers Step Back in its capabilities", () => {
    const { debug, response, responses } = session();
    debug.initializeRequest(response("initialize"), {});
    expect(responses[0].body.supportsStepBack).toBe(true);
  });

  it("rolls a held run back one beat on Step Back, keeps it held and stops at the restored beat", async () => {
    const { debug, response, responses, methods, rolls, stops } = session();
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(rolls()).toEqual([{ method: "game/rollBack", params: { to: "beat" } }]);
    expect(methods()).toEqual(["game/rollBack", "game/pause"]);
    expect(responses.map((r) => r.success)).toEqual([true]);
    expect(stops()).toEqual(["step"]);
  });

  it("holds and stops a run rolled back from its end", async () => {
    const { debug, state, response, methods, stops } = session({}, {
      stopped: false,
      ended: true,
    });
    await state("ended");
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(methods()).toEqual(["game/rollBack", "game/pause"]);
    expect(stops()).toEqual(["step"]);
  });

  it("rolls back to the last beat a breakpoint held on Reverse Continue", async () => {
    const { debug, response, responses, rolls, stops } = session();
    await debug.reverseContinueRequest(response("reverseContinue"), {
      threadId: 0,
    });
    expect(rolls()).toEqual([
      { method: "game/rollBack", params: { to: "breakpoint" } },
    ]);
    expect(responses.map((r) => r.success)).toEqual([true]);
    expect(stops()).toEqual(["step"]);
  });

  it("carries the bar's Skip and Shift+Skip as sparkdown/rollBack and sparkdown/rollForward", async () => {
    const { debug, response, responses, settle, rolls } = session();
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
    expect(rolls()).toEqual([
      { method: "game/rollBack", params: { to: "choice" } },
      { method: "game/rollForward", params: { to: "beat" } },
    ]);
    expect(responses.map((r) => [r.command, r.success, r.body])).toEqual([
      ["sparkdown/rollBack", true, { moved: true }],
      ["sparkdown/rollForward", true, { moved: true }],
    ]);
  });

  it("answers a roll the run refuses with its reason, and neither pauses nor stops", async () => {
    const { debug, response, responses, methods, stops } = session({
      "game/rollBack": { moved: false, reason: NOTHING_BEFORE, history: {} },
    });
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(responses.map((r) => [r.success, r.message])).toEqual([
      [false, NOTHING_BEFORE],
    ]);
    expect(methods()).toEqual(["game/rollBack"]);
    expect(stops()).toEqual([]);
  });

  it("answers a roll a later one superseded without a refusal", async () => {
    const { debug, response, responses, settle, methods } = session({
      "game/rollBack": { moved: false, superseded: true, history: {} },
    });
    debug.customRequest("sparkdown/rollBack", response("sparkdown/rollBack"), {
      to: "beat",
    });
    await settle();
    expect(responses.map((r) => [r.success, r.body])).toEqual([
      [true, { moved: false }],
    ]);
    expect(methods()).toEqual(["game/rollBack"]);
  });

  it("neither pauses nor stops a playing run that a roll moved", async () => {
    const { debug, response, methods, stops } = session({}, {
      stopped: false,
      ended: false,
    });
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(methods()).toEqual(["game/rollBack"]);
    expect(stops()).toEqual([]);
  });

  it("neither pauses nor stops a later run when the roll answered for an earlier one", async () => {
    const { debug, state, response, methods, stops } = session({
      "game/rollBack": { ...moved(0), run: 0 },
    });
    await state("pause");
    await debug.stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(methods()).toEqual(["game/rollBack"]);
    expect(stops()).toEqual([]);
  });

  it("does not stop on the engine's roll notification", async () => {
    const { debug, stops } = session();
    await debug.onReceiveNotification({
      jsonrpc: "2.0",
      method: "game/rolled",
      params: moved(1),
    });
    expect(stops()).toEqual([]);
  });
});
