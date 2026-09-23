// The game a worker runs calls the timer and frame functions it was given as
// methods of its configuration. A browser refuses to run its global's own
// functions on any other receiver ("Illegal invocation"), which is what a
// display from the player's worker hit the first time the asset module
// waited on a timer (#680).
import { afterEach, describe, expect, test, vi } from "vitest";
import { CreateGameMessage } from "../game/core/classes/messages/CreateGameMessage";
import { EnableGameDebugMessage } from "../game/core/classes/messages/EnableGameDebugMessage";
import { SetGameBreakpointsMessage } from "../game/core/classes/messages/SetGameBreakpointsMessage";
import { compileProgram } from "../tests/harness/compileProgram";
import { installGameWorker } from "./installGameWorker";

afterEach(() => vi.unstubAllGlobals());

const SOURCE = `-> start

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
    // With no game, nothing says where the breakpoint lands, so it is not
    // answered as a resolved breakpoint.
    expect(answers).toEqual([{ breakpoints: [] }]);
    await send(EnableGameDebugMessage.type.request({}));
    await send(CreateGameMessage.type.request({ program }));

    const game = state.game as any;
    expect(game).toBeDefined();
    expect(game.context.system.debugging).toBe(true);
    const stops = Object.values(
      game._breakpointMap as Record<number, Map<number, unknown>>,
    ).flatMap((m) => [...m.keys()]);
    expect(stops).toContain(line);
  });
});

describe("the configuration a worker gives its game", () => {
  test("runs the timer and frame functions on the worker's global", () => {
    const calls: string[] = [];
    // A global whose functions throw on any receiver but itself, as a
    // browser's do.
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
    expect(systemConfiguration.requestFrame!(() => ran++)).toBe(2);

    expect(ran).toBe(2);
    expect(calls).toEqual(["setTimeout 5", "requestAnimationFrame"]);
  });
});
