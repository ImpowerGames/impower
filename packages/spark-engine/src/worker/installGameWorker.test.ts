// The game a worker runs calls the timer and frame functions it was given as
// methods of its configuration. A browser refuses to run its global's own
// functions on any other receiver ("Illegal invocation"), which is what a
// display from the player's worker hit the first time the asset module
// waited on a timer (#680).
import { afterEach, describe, expect, test, vi } from "vitest";
import { installGameWorker } from "./installGameWorker";

afterEach(() => vi.unstubAllGlobals());

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
