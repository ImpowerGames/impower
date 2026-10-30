import { afterEach, describe, expect, test, vi } from "vitest";
import { CreateGameMessage } from "../game/core/classes/messages/CreateGameMessage";
import { EnableGameDebugMessage } from "../game/core/classes/messages/EnableGameDebugMessage";
import { GetGameEvaluationContextMessage } from "../game/core/classes/messages/GetGameEvaluationContextMessage";
import { GetGameVariablesMessage } from "../game/core/classes/messages/GetGameVariablesMessage";
import { PageFramedMessage } from "../game/core/classes/messages/PageFramedMessage";
import { SetGameBreakpointsMessage } from "../game/core/classes/messages/SetGameBreakpointsMessage";
import { compileProgram } from "../tests/harness/compileProgram";
import { installGameWorker, PAGE_FRAME_TIMEOUT_MS } from "./installGameWorker";

afterEach(() => vi.unstubAllGlobals());

const SOURCE = `

scene start
  HERO:
    The first line.
end
`;

describe("a game the worker creates", () => {
  test("starts with the debugger settings asked for before it existed", async () => {
    const program = compileProgram(SOURCE);
    const line = SOURCE.split("\n").findIndex((l) =>
      l.includes("The first line."),
    );
    const listeners: ((e: MessageEvent) => void)[] = [];
    const answers: unknown[] = [];
    const state = installGameWorker({
      addEventListener: (_: string, listener: (e: MessageEvent) => void) => {
        listeners.push(listener);
      },
      sendResponse: async (_message: unknown, result: unknown) => {
        answers.push(typeof result === "function" ? await result() : result);
      },
      sendNotification() {},
      postMessage() {},
    } as any);
    const send = async (message: unknown) => {
      for (const listener of listeners) {
        listener({ data: message } as MessageEvent);
      }
      await Promise.resolve();
    };

    await send(
      SetGameBreakpointsMessage.type.request({
        breakpoints: [{ file: program.uri, line }],
      }),
    );
    expect(answers).toEqual([{ breakpoints: [] }]);
    await send(EnableGameDebugMessage.type.request({}));
    await send(CreateGameMessage.type.request({ program }));

    const game = state.game as any;
    expect(game).toBeDefined();
    expect(game.context.system.debugging).toBe(true);
    const stops = [...(game._lineBreakAddresses as Set<number>)].map(
      (address) => game.locator.locationOf(address)?.startLine,
    );
    expect(stops).toContain(line);
  });
});

describe("a request for a game's temporaries", () => {
  test("answers with the frame it names, and with the running frame when it names none", async () => {
    vi.stubGlobal("self", {
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    const source = [
      "",
      "scene main",
      "  local mainLoc = 111",
      "  Main here.",
      "  -> sub ->",
      "  done",
      "end",
      "scene sub",
      "  local subLoc = 222",
      "  Sub here.",
      "  More sub.",
      "  ->->",
      "end",
      "",
      "scene start",
      "  -> main",
      "end",
      "",
    ].join("\n");
    const program = compileProgram(source);
    const listeners: ((e: MessageEvent) => void)[] = [];
    const answers: unknown[] = [];
    const state = installGameWorker({
      addEventListener: (_: string, listener: (e: MessageEvent) => void) => {
        listeners.push(listener);
      },
      sendResponse: async (_message: unknown, result: unknown) => {
        answers.push(typeof result === "function" ? await result() : result);
      },
      sendNotification() {},
      postMessage() {},
    } as any);
    const ask = async (message: unknown) => {
      for (const listener of listeners) {
        listener({ data: message } as MessageEvent);
      }
      await Promise.resolve();
      return answers.at(-1) as any;
    };
    await ask(CreateGameMessage.type.request({ program }));
    const game = state.game!;
    const line = source.split("\n").indexOf("  More sub.");
    game.setBreakpoints([{ file: program.uri, line }]);
    game.start();
    for (let i = 0; i < 8 && game.getStackTrace(0).totalFrames < 2; i += 1) {
      game.continue();
    }
    const frames = game.getStackTrace(0).stackFrames;
    expect(frames.map((f) => [f.id, f.name])).toEqual([
      [1, "sub"],
      [0, "main"],
    ]);
    const temps = async (params: object) =>
      (
        await ask(
          GetGameVariablesMessage.type.request({ scope: "temps", ...params }),
        )
      ).variables.map((v: { name: string; value: string }) => `${v.name}=${v.value}`);
    expect(await temps({ threadId: 0, frameId: 0 })).toEqual(["mainLoc=111"]);
    expect(await temps({ threadId: 0, frameId: 1 })).toEqual(["subLoc=222"]);
    expect(await temps({})).toEqual(["subLoc=222"]);
    const context = async (params: object) =>
      (await ask(GetGameEvaluationContextMessage.type.request(params))).context;
    expect(await context({ threadId: 0, frameId: 0 })).toMatchObject({
      mainLoc: 111,
    });
    expect(await context({ threadId: 0, frameId: 0 })).not.toHaveProperty(
      "subLoc",
    );
    expect(await context({})).toMatchObject({ subLoc: 222 });
    expect(await context({})).not.toHaveProperty("mainLoc");
  });
});

describe("a request for the Lists scope", () => {
  test("answers with no variables rather than an error", async () => {
    vi.stubGlobal("self", {
      setTimeout: () => 0,
      clearTimeout: () => {},
    });
    const program = compileProgram(SOURCE);
    const listeners: ((e: MessageEvent) => void)[] = [];
    const answers: unknown[] = [];
    installGameWorker({
      addEventListener: (_: string, listener: (e: MessageEvent) => void) => {
        listeners.push(listener);
      },
      sendResponse: async (_message: unknown, result: unknown) => {
        answers.push(typeof result === "function" ? await result() : result);
      },
      sendNotification() {},
      postMessage() {},
    } as any);
    const ask = async (message: unknown) => {
      for (const listener of listeners) {
        listener({ data: message } as MessageEvent);
      }
      await Promise.resolve();
      return answers.at(-1);
    };
    await ask(CreateGameMessage.type.request({ program }));
    expect(
      await ask(
        GetGameVariablesMessage.type.request({ scope: "lists" } as never),
      ),
    ).toEqual({ variables: [] });
  });
});

describe("the configuration a worker gives its game", () => {
  test("runs the timer and frame functions on the worker's global", () => {
    const calls: string[] = [];
    const global: any = {
      setTimeout(this: unknown, handler: Function, timeout?: number) {
        if (this !== global) throw new TypeError("Illegal invocation");
        calls.push(`setTimeout ${timeout}`);
        handler();
        return 1;
      },
      requestAnimationFrame(this: unknown, callback: (time: number) => void) {
        if (this !== global) throw new TypeError("Illegal invocation");
        calls.push("requestAnimationFrame");
        callback(0);
        return 2;
      },
    };
    vi.stubGlobal("self", global);
    const { systemConfiguration } = installGameWorker({
      addEventListener() {},
    } as any);
    let ran = 0;

    expect(systemConfiguration.setTimeout!(() => ran++, 5)).toBe(1);
    expect(systemConfiguration.requestFrame!(() => ran++)).toBe(1);

    expect(ran).toBe(2);
    expect(calls).toEqual(["setTimeout 5", `setTimeout ${1000 / 60}`]);
  });
});

describe("when the games a worker holds tick", () => {
  const createWorker = () => {
    const calls: string[] = [];
    const timers = new Map<number, { handler: () => void; timeout?: number }>();
    let nextTimer = 1;
    vi.stubGlobal("self", {
      setTimeout: (handler: () => void, timeout?: number) => {
        calls.push(`setTimeout ${timeout}`);
        timers.set(nextTimer, { handler, timeout });
        return nextTimer++;
      },
      clearTimeout: (id: number) => {
        timers.delete(id);
      },
      requestAnimationFrame: () => {
        calls.push("requestAnimationFrame");
        return 0;
      },
    });
    const listeners: ((e: MessageEvent) => void)[] = [];
    const { systemConfiguration } = installGameWorker({
      addEventListener: (_: string, listener: (e: MessageEvent) => void) => {
        listeners.push(listener);
      },
    } as any);
    const pageFramed = () => {
      for (const listener of listeners) {
        listener({
          data: PageFramedMessage.type.notification({}),
        } as MessageEvent);
      }
    };
    const fireTimers = () => {
      const due = [...timers.values()];
      timers.clear();
      for (const timer of due) timer.handler();
    };
    return { calls, timers, systemConfiguration, pageFramed, fireTimers };
  };

  test("on a timer at the clock's rate before the page sends a frame, never on the worker's animation frames", () => {
    const worker = createWorker();
    let ticks = 0;

    worker.systemConfiguration.requestFrame!(() => ticks++);
    expect(worker.calls).toEqual([`setTimeout ${1000 / 60}`]);
    worker.fireTimers();

    expect(ticks).toBe(1);
  });

  test("on the page's next frame once it sends them, and not before", () => {
    const worker = createWorker();
    let ticks = 0;
    worker.pageFramed();

    worker.systemConfiguration.requestFrame!(() => ticks++);
    worker.systemConfiguration.requestFrame!(() => ticks++);
    expect(ticks).toBe(0);
    worker.pageFramed();

    expect(ticks).toBe(2);
    expect(worker.timers.size).toBe(0);
  });

  test("on a timer again once the page stops sending frames, as a hidden page does", () => {
    const worker = createWorker();
    let ticks = 0;
    worker.pageFramed();

    worker.systemConfiguration.requestFrame!(() => ticks++);
    expect([...worker.timers.values()].map((t) => t.timeout)).toEqual([
      PAGE_FRAME_TIMEOUT_MS,
    ]);
    worker.fireTimers();
    expect(ticks).toBe(1);

    worker.systemConfiguration.requestFrame!(() => ticks++);
    expect([...worker.timers.values()].map((t) => t.timeout)).toEqual([
      1000 / 60,
    ]);
  });
});
