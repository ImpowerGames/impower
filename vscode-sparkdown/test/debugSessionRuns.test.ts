import { describe, expect, it, vi } from "vitest";

vi.mock("../src/managers/SparkdownDebugManager", () => ({
  SparkdownDebugManager: { instance: { syncCursorToExecution: true } },
}));

import { DidChangeGameStateMessage } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameAwaitingInteractionMessage";
import { GameClickedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameClickedToContinueMessage";
import { GameEndedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEndedMessage";
import { GameHitBreakpointMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameHitBreakpointMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import { SparkDebugSession } from "../src/debugger/SparkDebugSession";

const location = (line: number) => ({
  uri: "file:///main.sd",
  range: {
    start: { line, character: 0 },
    end: { line, character: 4 },
  },
});

const state = (
  launchState: "play" | "pause" | "ended" | "preview",
  run: number | null,
) =>
  DidChangeGameStateMessage.type.notification({
    mounted: true,
    programLoaded: true,
    programVersion: 1,
    launchState,
    run,
    position: null,
    completion: null,
  });

const ended = (run: number) =>
  GameEndedMessage.type.notification({
    kind: "fin",
    location: location(2),
    run,
  });

const stop = (reason: "breakpoint" | "step" | "awaiting interaction", run: number) =>
  reason === "breakpoint"
    ? GameHitBreakpointMessage.type.notification({ location: location(1), run })
    : reason === "step"
      ? GameSteppedMessage.type.notification({ location: location(1), run })
      : GameAwaitingInteractionMessage.type.notification({
          location: location(1),
          run,
        });

const session = () => {
  const player = {
    run: 1 as number | null,
    launchState: "play" as "play" | "pause" | "ended" | "preview",
  };
  const sent: string[] = [];
  const events: [string, string | null][] = [];
  let during:
    | {
        act: (method: string) => Promise<void> | void;
        method: string | undefined;
      }
    | undefined;
  let held: Promise<void> | undefined;
  let release: (() => void) | undefined;
  const connection = {
    connectInput() {},
    emit: async (message: { method: string }) => {
      sent.push(message.method);
      const run = player.run;
      const launchState = player.launchState;
      if (during && (!during.method || during.method === message.method)) {
        const { act } = during;
        during = undefined;
        await act(message.method);
      }
      if (held && message.method === "game/threads") {
        const wait = held;
        held = undefined;
        await wait;
      }
      if (message.method === "preview/gameState") {
        return state(launchState, run).params;
      }
      return message.method === "game/threads"
        ? { threads: [{ id: 0, name: "main" }], run }
        : { run, done: false };
    },
  };
  const fileAccessor = {
    isWindows: false,
    showFile: async () => {},
    uriToPath: (uri: string) => uri.replace("file://", ""),
    pathToUri: (path: string) => `file://${path}`,
    getRootPath: () => undefined,
  };
  const s = new SparkDebugSession(fileAccessor as any, connection as any);
  (s as any).sendEvent = (event: any) =>
    events.push([event.event, event.body?.reason ?? null]);
  (s as any).sendResponse = () => events.push(["response", null]);
  return {
    player,
    sent,
    events,
    notify: (message: any) => (s as any).onReceiveNotification(message),
    current: () => (s as any)._run,
    request: (name: string) => (s as any)[name]({ body: {} }, {}),
    duringNext: (
      act: (method: string) => Promise<void> | void,
      method?: string,
    ) => {
      during = { act, method };
    },
    holdNextLookup: () => {
      held = new Promise<void>((resolve) => (release = resolve));
      return () => release?.();
    },
    lookupHeld: async () => {
      while (held) {
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    },
  };
};

describe("the debug adapter judging stops by the run they belong to", () => {
  it("keeps the replay's first stop when the replay finishes launching during its lookup", async () => {
    const s = session();
    await s.notify(state("play", 1));
    await s.notify(ended(1));
    await s.notify(state("ended", 1));
    await s.request("restartRequest");
    s.player.run = null;
    await s.notify(state("preview", null));
    s.player.run = 2;
    s.events.length = 0;
    s.duringNext(async () => {
      await s.notify(state("play", 2));
    });
    await s.notify(stop("awaiting interaction", 2));
    expect(s.events).toEqual([["stopped", "awaiting interaction"]]);
  });

  for (const reason of ["breakpoint", "step"] as const) {
    it(`keeps a ${reason} stop when the run pauses and resumes during its lookup`, async () => {
      const s = session();
      await s.notify(state("play", 1));
      s.duringNext(async () => {
        await s.notify(state("pause", 1));
        await s.notify(state("play", 1));
      });
      await s.notify(stop(reason, 1));
      expect(s.events).toEqual([["stopped", reason]]);
    });
  }

  it("publishes no pause stop whose lookup outlives the run's end and its replay", async () => {
    const s = session();
    await s.notify(state("play", 1));
    const release = s.holdNextLookup();
    const paused = s.request("pauseRequest");
    await s.lookupHeld();
    await s.notify(ended(1));
    await s.notify(state("ended", 1));
    await s.request("restartRequest");
    s.player.run = null;
    await s.notify(state("preview", null));
    s.player.run = 2;
    await s.notify(state("play", 2));
    release();
    await paused;
    expect(s.events).toEqual([
      ["response", null],
      ["stopped", "end"],
      ["response", null],
      ["continued", null],
    ]);
  });

  it("drops an old run's stop whose lookup was answered for its run after an edit restarted the game", async () => {
    const s = session();
    await s.notify(state("play", 1));
    s.duringNext(async () => {
      s.player.run = 2;
      await s.notify(state("play", 2));
    });
    await s.notify(stop("step", 1));
    expect(s.events).toEqual([]);
    await s.notify(stop("awaiting interaction", 2));
    expect(s.events).toEqual([["stopped", "awaiting interaction"]]);
  });

  it("drops a pending pause stop of the ended run while teardown has named no replacement run", async () => {
    const s = session();
    await s.notify(state("play", 1));
    const release = s.holdNextLookup();
    const paused = s.request("pauseRequest");
    await s.lookupHeld();
    await s.notify(ended(1));
    await s.notify(state("ended", 1));
    await s.request("restartRequest");
    s.player.run = null;
    await s.notify(state("preview", null));
    expect(s.current()).toBeNull();
    release();
    await paused;
    expect(s.events).toEqual([
      ["response", null],
      ["stopped", "end"],
      ["response", null],
      ["continued", null],
    ]);
  });

  for (const [request, method] of [
    ["nextRequest", "game/step"],
    ["stepInRequest", "game/step"],
    ["stepOutRequest", "game/step"],
    ["continueRequest", "game/continue"],
  ] as const) {
    it(`keeps the newer run current when ${method} for the older run is answered after the newer run is named (${request})`, async () => {
      const s = session();
      await s.notify(state("play", 1));
      s.duringNext(async () => {
        s.player.run = 2;
        await s.notify(state("play", 2));
      }, method);
      await s.request(request);
      expect(s.sent).toContain(method);
      expect(s.current()).toBe(2);
      await s.notify(stop("step", 1));
      expect(s.events.filter(([event]) => event === "stopped")).toEqual([]);
      await s.notify(stop("step", 2));
      expect(s.events.filter(([event]) => event === "stopped")).toEqual([
        ["stopped", "step"],
      ]);
    });
  }

  it("publishes the end stop once when the ended launch state arrives during game/ended's lookup", async () => {
    const s = session();
    await s.notify(state("play", 1));
    s.duringNext(async () => {
      await s.notify(state("ended", 1));
    });
    await s.notify(ended(1));
    await s.notify(state("ended", 1));
    expect(s.events).toEqual([["stopped", "end"]]);
  });

  it("publishes the end stop once when the ended launch state arrives before game/ended", async () => {
    const s = session();
    await s.notify(state("play", 1));
    await s.notify(state("ended", 1));
    expect(s.events).toEqual([]);
    await s.notify(ended(1));
    await s.notify(state("ended", 1));
    expect(s.events).toEqual([["stopped", "end"]]);
  });

  it("publishes no pause stop for a run that ended while the pause was answered", async () => {
    const s = session();
    await s.notify(state("play", 1));
    s.duringNext(async (method) => {
      if (method === "game/pause") {
        await s.notify(ended(1));
        await s.notify(state("ended", 1));
      }
    });
    await s.request("pauseRequest");
    expect(s.events).toEqual([
      ["stopped", "end"],
      ["response", null],
    ]);
  });

  it("publishes no pause stop for a run that was replaced while the pause was answered", async () => {
    const s = session();
    await s.notify(state("play", 1));
    s.duringNext(async (method) => {
      if (method === "game/pause") {
        s.player.run = 2;
        await s.notify(state("play", 2));
      }
    });
    await s.request("pauseRequest");
    expect(s.events).toEqual([["response", null]]);
  });

  it("still stops on a pause the current run answers", async () => {
    const s = session();
    await s.notify(state("play", 1));
    s.duringNext(async (method) => {
      if (method === "game/pause") {
        await s.notify(state("pause", 1));
      }
    });
    await s.request("pauseRequest");
    expect(s.events).toEqual([
      ["response", null],
      ["stopped", "pause"],
    ]);
  });
});

const click = (run: number) =>
  GameClickedToContinueMessage.type.notification({ location: location(1), run });

describe("the debug adapter learning the current run when it starts", () => {
  it("publishes the first run's awaiting-interaction stop after a click when it starts on game/started", async () => {
    const s = session();
    await s.request("launchRequest");
    expect(s.sent).toContain("preview/gameState");
    expect(s.current()).toBe(1);
    s.events.length = 0;
    await s.notify(click(1));
    await s.notify(stop("awaiting interaction", 1));
    expect(s.events).toEqual([
      ["continued", null],
      ["stopped", "awaiting interaction"],
    ]);
  });

  it("judges the stops of a run already playing when it attaches", async () => {
    const s = session();
    s.player.run = 2;
    await s.request("attachRequest");
    expect(s.current()).toBe(2);
    s.events.length = 0;
    await s.notify(stop("step", 1));
    expect(s.events).toEqual([]);
    for (const reason of ["breakpoint", "step", "awaiting interaction"] as const) {
      await s.notify(stop(reason, 2));
    }
    expect(s.events).toEqual([
      ["stopped", "breakpoint"],
      ["stopped", "step"],
      ["stopped", "awaiting interaction"],
    ]);
  });

  it("stops on the end when it attaches to an ended run, and answers a step with the end stop", async () => {
    const s = session();
    s.player.launchState = "ended";
    await s.request("attachRequest");
    expect(s.current()).toBe(1);
    expect([...s.events].sort()).toEqual([
      ["response", null],
      ["stopped", "end"],
    ]);
    s.events.length = 0;
    s.sent.length = 0;
    await s.request("nextRequest");
    expect(s.sent).not.toContain("game/step");
    expect(s.events).toEqual([
      ["response", null],
      ["stopped", "end"],
    ]);
  });

  for (const timing of ["before its launch", "during its first read"] as const) {
    it(`stops on the end once when it attaches to an ended run whose state is published ${timing}`, async () => {
      const s = session();
      s.player.launchState = "ended";
      if (timing === "before its launch") {
        await s.notify(state("ended", 1));
      } else {
        s.duringNext(async () => {
          await s.notify(state("ended", 1));
        }, "preview/gameState");
      }
      await s.request("launchRequest");
      expect(s.events.filter(([event]) => event === "stopped")).toEqual([
        ["stopped", "end"],
      ]);
      await s.notify(state("ended", 1));
      expect(s.events.filter(([event]) => event === "stopped")).toEqual([
        ["stopped", "end"],
      ]);
    });
  }

  it("publishes a numbered stop that arrives before its first read is answered", async () => {
    const s = session();
    let stopped: Promise<void> | undefined;
    s.duringNext(async () => {
      stopped = s.notify(stop("awaiting interaction", 1));
      await new Promise((resolve) => setTimeout(resolve, 0));
    }, "preview/gameState");
    await s.request("launchRequest");
    await stopped;
    expect(s.events.filter(([event]) => event === "stopped")).toEqual([
      ["stopped", "awaiting interaction"],
    ]);
  });

  for (const lookup of ["before", "after"] as const) {
    it(`publishes the end stop once when the run ends during its first read and the end's lookup finishes ${lookup} the read`, async () => {
      const s = session();
      s.player.launchState = "ended";
      let finished: Promise<void> | undefined;
      const release = lookup === "after" ? s.holdNextLookup() : undefined;
      s.duringNext(async () => {
        finished = s.notify(ended(1));
        if (lookup === "after") {
          await s.lookupHeld();
        } else {
          await new Promise((resolve) => setTimeout(resolve, 0));
        }
      }, "preview/gameState");
      await s.request("launchRequest");
      release?.();
      await finished;
      expect(s.events.filter(([event]) => event === "stopped")).toEqual([
        ["stopped", "end"],
      ]);
    });
  }

  it("keeps a state publication that arrives while its first read is answered over that read's older answer", async () => {
    const s = session();
    s.player.launchState = "ended";
    s.duringNext(async () => {
      s.player.run = 2;
      s.player.launchState = "play";
      await s.notify(state("play", 2));
    }, "preview/gameState");
    await s.request("launchRequest");
    expect(s.current()).toBe(2);
    expect(s.events.filter(([event]) => event === "stopped")).toEqual([]);
    s.events.length = 0;
    await s.notify(stop("awaiting interaction", 1));
    await s.notify(stop("awaiting interaction", 2));
    expect(s.events).toEqual([["stopped", "awaiting interaction"]]);
  });

  it("publishes the same stops as before when it starts before RUN", async () => {
    const run = async (launch: boolean) => {
      const s = session();
      s.player.run = null;
      s.player.launchState = "preview";
      if (launch) {
        await s.request("launchRequest");
      }
      s.player.run = 1;
      s.player.launchState = "play";
      s.events.length = 0;
      await s.notify(state("play", 1));
      await s.notify(stop("awaiting interaction", 1));
      await s.notify(click(1));
      await s.notify(stop("step", 1));
      await s.notify(ended(1));
      await s.notify(state("ended", 1));
      return s.events;
    };
    const today = await run(false);
    expect(today).toEqual([
      ["stopped", "awaiting interaction"],
      ["continued", null],
      ["stopped", "step"],
      ["stopped", "end"],
    ]);
    expect(await run(true)).toEqual(today);
  });
});
