// The page tells the player's worker when it has finished rendering a frame
// while PLAY's game is attached, and the worker's games tick on it, so what a
// tick posts reaches a page that is not rendering (#811). The stopped preview
// never ticks, so its sink sends nothing.
import { PageFramedMessage } from "@impower/spark-engine/src/game/core/classes/messages/PageFramedMessage";
import { afterEach, describe, expect, test, vi } from "vitest";
import { WorkerGameLink } from "./WorkerGameLink";

afterEach(() => vi.unstubAllGlobals());

/** A link whose page frames and timers the test runs. */
const createLink = () => {
  const posted: any[] = [];
  let frames: (() => void)[] = [];
  let tasks: (() => void)[] = [];
  vi.stubGlobal("requestAnimationFrame", (callback: () => void) => {
    frames.push(callback);
    return frames.length;
  });
  vi.stubGlobal("setTimeout", (handler: () => void) => {
    tasks.push(handler);
    return tasks.length;
  });
  vi.stubGlobal(
    "BroadcastChannel",
    class {
      onmessage = null;
      constructor(readonly name: string) {}
      close() {}
    },
  );
  const link = new WorkerGameLink({
    addEventListener() {},
    postMessage: (message: any) => posted.push(message),
  } as any);
  /** Render one frame: its callbacks, then the tasks they queued. */
  const frame = () => {
    const running = frames;
    frames = [];
    for (const callback of running) callback();
    const queued = tasks;
    tasks = [];
    for (const task of queued) task();
  };
  const framed = () =>
    posted.filter((m) => PageFramedMessage.type.isNotification(m)).length;
  return { link, frame, framed };
};

describe("the page's frames", () => {
  test("reach the worker once each has rendered, while PLAY's sink is attached", () => {
    const { link, frame, framed } = createLink();
    const sink = () => {};

    link.attachPlay(sink);
    frame();
    frame();
    frame();
    expect(framed()).toBe(3);

    link.detach(sink);
    frame();
    frame();
    expect(framed()).toBe(3);
  });

  test("are not sent for the stopped preview's sink", () => {
    const { link, frame, framed } = createLink();

    link.attach(() => {});
    frame();
    frame();

    expect(framed()).toBe(0);
  });
});
