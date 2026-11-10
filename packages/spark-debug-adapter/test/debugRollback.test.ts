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
  player = { stopped: true },
) => {
  const sent: { method: string; params: unknown }[] = [];
  const events: { event: string; body?: any }[] = [];
  const responses: any[] = [];
  const debug = new SparkDebugSession(
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
          return { threads: [{ id: 0, name: "main" }], stopped: player.stopped };
        }
        return rolls[message.method] ?? moved(0);
      },
    } as any,
    { syncCursorToExecution: false },
  );
  (debug as any).sendResponse = (response: any) => responses.push(response);
  (debug as any).sendEvent = (event: any) => events.push(event);
  const response = (command: string) => ({
    seq: 0,
    type: "response",
    request_seq: 1,
    command,
    success: true,
  });
  const rolled = () =>
    (debug as any).onReceiveNotification({
      jsonrpc: "2.0",
      method: "game/rolled",
      params: moved(1),
    });
  const settle = async () => {
    for (let i = 0; i < 10; i += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  };
  const rolls_ = () =>
    sent.filter((m) => m.method === "game/rollBack" || m.method === "game/rollForward");
  const stops = () =>
    events.filter((e) => e.event === "stopped").map((e) => e.body.reason);
  return { debug, response, responses, events, rolled, settle, rolls: rolls_, stops };
};

describe("rolling a debug run back and forward", () => {
  it("offers Step Back in its capabilities", () => {
    const { debug, response, responses } = session();
    (debug as any).initializeRequest(response("initialize"), {});
    expect(responses[0].body.supportsStepBack).toBe(true);
  });

  it("rolls back one beat on Step Back, and stops at the restored beat once it is drawn", async () => {
    const { debug, response, responses, rolled, rolls, stops } = session();
    await (debug as any).stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(rolls()).toEqual([{ method: "game/rollBack", params: { to: "beat" } }]);
    expect(responses.map((r) => r.success)).toEqual([true]);
    await rolled();
    expect(stops()).toEqual(["step"]);
  });

  it("rolls back to the last beat a breakpoint held on Reverse Continue", async () => {
    const { debug, response, responses, rolls } = session();
    await (debug as any).reverseContinueRequest(response("reverseContinue"), {
      threadId: 0,
    });
    expect(rolls()).toEqual([
      { method: "game/rollBack", params: { to: "breakpoint" } },
    ]);
    expect(responses.map((r) => r.success)).toEqual([true]);
  });

  it("carries the bar's Skip and Shift+Skip as sparkdown/rollBack and sparkdown/rollForward", async () => {
    const { debug, response, responses, settle, rolls } = session();
    (debug as any).customRequest("sparkdown/rollBack", response("sparkdown/rollBack"), {
      to: "choice",
    });
    (debug as any).customRequest(
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

  it("answers a roll the run refuses with its reason, and does not stop", async () => {
    const { debug, response, responses, stops } = session({
      "game/rollBack": { moved: false, reason: NOTHING_BEFORE, history: {} },
    });
    await (debug as any).stepBackRequest(response("stepBack"), { threadId: 0 });
    expect(responses.map((r) => [r.success, r.message])).toEqual([
      [false, NOTHING_BEFORE],
    ]);
    expect(stops()).toEqual([]);
  });

  it("answers a roll a later one superseded without a refusal", async () => {
    const { debug, response, responses, settle } = session({
      "game/rollBack": { moved: false, superseded: true, history: {} },
    });
    (debug as any).customRequest("sparkdown/rollBack", response("sparkdown/rollBack"), {
      to: "beat",
    });
    await settle();
    expect(responses.map((r) => [r.success, r.body])).toEqual([
      [true, { moved: false }],
    ]);
  });

  it("does not stop a playing run that a roll moved", async () => {
    const { debug, response, rolled, stops } = session({}, { stopped: false });
    await (debug as any).stepBackRequest(response("stepBack"), { threadId: 0 });
    await rolled();
    expect(stops()).toEqual([]);
  });
});
