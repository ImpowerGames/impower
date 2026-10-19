// The Variables view shows the temporaries of the frame selected in the Call
// Stack (#1727): the debug adapter gives each engine frame an id unique across
// threads, and a Temps scope it creates for a frame names that thread and
// frame in the requests it sends the game, as an expression it evaluates for
// hover or Watch does (#1740).
import { describe, expect, it, vi } from "vitest";

vi.mock("../src/managers/SparkdownDebugManager", () => ({
  SparkdownDebugManager: { instance: {} },
}));

import { SparkDebugSession } from "../src/debugger/SparkDebugSession";

const location = (line: number) => ({
  uri: "file:///main.sd",
  range: {
    start: { line, character: 0 },
    end: { line, character: 4 },
  },
});

/** The engine's frames of each thread, outermost last, as the game numbers
 *  them: from 0 in each thread. */
const FRAMES: Record<number, { id: number; name: string; line: number }[]> = {
  0: [
    { id: 1, name: "show", line: 10 },
    { id: 0, name: "main", line: 5 },
  ],
  1: [{ id: 0, name: "side", line: 20 }],
};

/** A session over a game that answers with `FRAMES`, recording each
 *  variables request it is sent and each response the session gives. */
const session = () => {
  const sent: { method: string; params: any }[] = [];
  const responses: any[] = [];
  const connection = {
    connectInput() {},
    emit: async (message: { method: string; params: any }) => {
      sent.push(message);
      if (message.method === "game/stackTrace") {
        const frames = FRAMES[message.params.threadId] ?? [];
        return {
          stackFrames: frames.map((f) => ({
            id: f.id,
            name: f.name,
            location: location(f.line),
          })),
          totalFrames: frames.length,
        };
      }
      if (message.method === "game/variables") {
        return { variables: [{ name: "x", value: "1", scopePath: "show" }] };
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
  (s as any).sendResponse = (response: any) => responses.push(response);
  const call = async (name: string, args: object) => {
    await (s as any)[name]({ body: {} }, args);
    return responses.at(-1)!.body;
  };
  const variablesSent = () =>
    sent.filter((m) => m.method === "game/variables").map((m) => m.params);
  const contextsSent = () =>
    sent
      .filter((m) => m.method === "game/evaluationContext")
      .map((m) => m.params);
  return { call, variablesSent, contextsSent };
};

describe("the debug adapter's frames", () => {
  it("gives frames of two threads ids of their own, and reads the Temps of the frame selected", async () => {
    const s = session();
    const first = await s.call("stackTraceRequest", { threadId: 0 });
    const second = await s.call("stackTraceRequest", { threadId: 1 });
    const ids = [...first.stackFrames, ...second.stackFrames].map(
      (f: { id: number }) => f.id,
    );
    expect(new Set(ids).size).toBe(3);
    // The same frame keeps its id when the stack is read again.
    const again = await s.call("stackTraceRequest", { threadId: 0 });
    expect(again.stackFrames.map((f: { id: number }) => f.id)).toEqual(
      first.stackFrames.map((f: { id: number }) => f.id),
    );

    const temps = async (frameId: number) => {
      const { scopes } = await s.call("scopesRequest", { frameId });
      const scope = scopes.find((c: { name: string }) => c.name === "Temps");
      await s.call("variablesRequest", {
        variablesReference: scope.variablesReference,
      });
      return s.variablesSent().at(-1);
    };
    // `main`, the caller in thread 0, selected below `show`.
    expect(await temps(first.stackFrames[1].id)).toEqual({
      scope: "temps",
      threadId: 0,
      frameId: 0,
    });
    expect(await temps(first.stackFrames[0].id)).toEqual({
      scope: "temps",
      threadId: 0,
      frameId: 1,
    });
    // Thread 1's frame, whose engine number is `main`'s too.
    expect(await temps(second.stackFrames[0].id)).toEqual({
      scope: "temps",
      threadId: 1,
      frameId: 0,
    });
  });

  it("names the selected frame when a data breakpoint is asked for on one of its temporaries", async () => {
    const s = session();
    const { stackFrames } = await s.call("stackTraceRequest", { threadId: 0 });
    const { scopes } = await s.call("scopesRequest", {
      frameId: stackFrames[1].id,
    });
    const temps = scopes.find((c: { name: string }) => c.name === "Temps");
    const info = await s.call("dataBreakpointInfoRequest", {
      variablesReference: temps.variablesReference,
      name: "x",
    });
    expect(s.variablesSent().at(-1)).toEqual({
      scope: "temps",
      threadId: 0,
      frameId: 0,
    });
    expect(info.dataId).toBe("show.x");
  });

  it("reads the running frame for a frame id it never gave", async () => {
    const s = session();
    const { scopes } = await s.call("scopesRequest", { frameId: 999 });
    const temps = scopes.find((c: { name: string }) => c.name === "Temps");
    await s.call("variablesRequest", {
      variablesReference: temps.variablesReference,
    });
    expect(s.variablesSent().at(-1)).toEqual({ scope: "temps" });
  });

  // Hover and Watch evaluate in the frame selected in the Call Stack, as
  // its Temps scope reads it (#1740).
  it("evaluates an expression in the frame selected, and in the running frame for one it never gave", async () => {
    const s = session();
    const first = await s.call("stackTraceRequest", { threadId: 0 });
    const second = await s.call("stackTraceRequest", { threadId: 1 });
    const evaluate = async (frameId?: number) => {
      await s.call("evaluateRequest", {
        expression: "x",
        context: "hover",
        frameId,
      });
      return s.contextsSent().at(-1);
    };
    expect(await evaluate(first.stackFrames[1].id)).toEqual({
      threadId: 0,
      frameId: 0,
    });
    expect(await evaluate(first.stackFrames[0].id)).toEqual({
      threadId: 0,
      frameId: 1,
    });
    expect(await evaluate(second.stackFrames[0].id)).toEqual({
      threadId: 1,
      frameId: 0,
    });
    expect(await evaluate(999)).toEqual({});
    expect(await evaluate(undefined)).toEqual({});
  });

  // Sparkdown has no list type (#1752), so the Variables view shows no
  // Lists scope and never asks the game for one (#1805).
  it("offers the Temps, Vars and Defines scopes and asks the game for each", async () => {
    const s = session();
    const { stackFrames } = await s.call("stackTraceRequest", { threadId: 0 });
    const { scopes } = await s.call("scopesRequest", {
      frameId: stackFrames[0].id,
    });
    expect(scopes.map((c: { name: string }) => c.name)).toEqual([
      "Temps",
      "Vars",
      "Defines",
    ]);
    for (const scope of scopes) {
      await s.call("variablesRequest", {
        variablesReference: scope.variablesReference,
      });
    }
    expect(s.variablesSent().map((p) => p.scope)).toEqual([
      "temps",
      "vars",
      "defines",
    ]);
  });
});
